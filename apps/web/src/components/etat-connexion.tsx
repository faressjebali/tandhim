'use client';

import { useEffect, useState } from 'react';

/** Le serveur répond-il ? (Tailscale ou Internet coupé, serveur éteint…) */
async function serveurJoignable(): Promise<boolean> {
  try {
    const r = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Enregistre le service worker (cache hors ligne, notifications) et affiche un bandeau quand le
 * serveur est injoignable : la page affichée est alors la dernière version gardée en cache.
 */
export function EtatConnexion() {
  const [horsLigne, setHorsLigne] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    let actif = true;
    const verifier = async () => {
      const ok = navigator.onLine && (await serveurJoignable());
      if (actif) setHorsLigne(!ok);
    };
    void verifier();
    const auRetour = () => document.visibilityState === 'visible' && void verifier();
    const id = setInterval(verifier, 60_000);
    window.addEventListener('online', verifier);
    window.addEventListener('offline', verifier);
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      actif = false;
      clearInterval(id);
      window.removeEventListener('online', verifier);
      window.removeEventListener('offline', verifier);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, []);

  if (!horsLigne) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 border-b-2 border-encre bg-corail px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-[14px] text-white"
    >
      <p>
        <span className="font-bold">Serveur injoignable.</span> Tu vois les dernières données
        enregistrées sur cet appareil.
      </p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="min-h-11 shrink-0 rounded-xl border-2 border-encre bg-surface px-3 font-bold text-encre"
      >
        Réessayer
      </button>
    </div>
  );
}
