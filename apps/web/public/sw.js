// Service worker de Tandhim :
// - notifications Web Push (affichage, ouverture de la bonne page au toucher) ;
// - hors ligne : dernières pages consultées gardées en cache, servies si le serveur ne répond pas.

const VERSION = 'v1';
const CACHE_PAGES = `tandhim-pages-${VERSION}`;
const CACHE_STATIQUE = `tandhim-statique-${VERSION}`;
/** Au-delà, on sert la page en cache (serveur injoignable ou très lent). */
const DELAI_RESEAU_MS = 6000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      const gardes = [CACHE_PAGES, CACHE_STATIQUE];
      for (const nom of await caches.keys()) {
        if (nom.startsWith('tandhim-') && !gardes.includes(nom)) await caches.delete(nom);
      }
      await self.clients.claim();
    })(),
  ),
);

function avecDelai(promesse, ms) {
  return new Promise((ok, ko) => {
    const minuteur = setTimeout(() => ko(new Error('délai dépassé')), ms);
    promesse.then(
      (r) => {
        clearTimeout(minuteur);
        ok(r);
      },
      (e) => {
        clearTimeout(minuteur);
        ko(e);
      },
    );
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/connexion')) return;

  // Fichiers de l'app (versionnés, immuables) : cache d'abord.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icone/')) {
    event.respondWith(
      caches.open(CACHE_STATIQUE).then(async (cache) => {
        const enCache = await cache.match(req);
        if (enCache) return enCache;
        const r = await fetch(req);
        if (r.ok) cache.put(req, r.clone());
        return r;
      }),
    );
    return;
  }

  // Pages : réseau d'abord ; si le serveur ne répond pas, dernière version gardée.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_PAGES);
        try {
          const r = await avecDelai(fetch(req), DELAI_RESEAU_MS);
          // Une redirection vers /connexion n'est pas une page à garder.
          if (r.ok && !r.redirected) cache.put(req, r.clone());
          return r;
        } catch {
          return (
            (await cache.match(req, { ignoreSearch: false })) ??
            (await cache.match(url.pathname)) ??
            (await cache.match('/')) ??
            new Response(
              '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;background:#fff3dc;padding:24px"><h1>Serveur injoignable</h1><p>Tandhim ne répond pas (coupure d’Internet ou du serveur). Réessaie dans quelques minutes.</p>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
            )
          );
        }
      })(),
    );
  }
  // Données de navigation interne (RSC) : réseau seulement ; en cas d'échec, Next recharge la
  // page entière, qui passe par le cas « navigate » ci-dessus.
});

self.addEventListener('push', (event) => {
  let d;
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { corps: event.data ? event.data.text() : '' };
  }
  // Sur iPhone, chaque push DOIT afficher une notification (sinon l'abonnement est retiré).
  event.waitUntil(
    self.registration.showNotification(d.titre || 'Tandhim', {
      body: d.corps || '',
      tag: d.tag,
      lang: 'fr',
      icon: '/icone/192',
      badge: '/icone/192',
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      // Lien externe (Meet, Teams…) : ouvert à part, l'app reste où elle était.
      if (!url.startsWith(self.location.origin)) return self.clients.openWindow(url);
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const f of fenetres) {
        if (f.url.startsWith(self.location.origin)) {
          await f.focus();
          if ('navigate' in f) await f.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
