'use client';

import { useEffect, useState, useTransition } from 'react';
import { abonnerAppareil, desabonnerAppareil, envoyerNotificationTest } from './actions';

type Etat =
  'chargement' | 'ajouter-ecran-accueil' | 'non-supporte' | 'refuse' | 'inactif' | 'actif';

const bouton = 'bloc bloc-presse inline-block min-h-11 px-4 py-2.5 text-[16px] font-bold';

function nomAppareil(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  const systeme = /Windows/.test(ua) ? 'PC Windows' : /Mac/.test(ua) ? 'Mac' : 'Ordinateur';
  const nav = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : 'Safari';
  return `${systeme} (${nav})`;
}

const estIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const estInstallee = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function cleServeur(base64: string): Uint8Array<ArrayBuffer> {
  const b = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const brut = atob(b);
  const cle = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) cle[i] = brut.charCodeAt(i);
  return cle;
}

/** Activation des notifications sur l'appareil qui affiche la page. */
export function NotificationsAppareil({ clePublique }: { clePublique: string }) {
  const [etat, setEtat] = useState<Etat>('chargement');
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    (async () => {
      const supporte =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supporte)
        return setEtat(estIos() && !estInstallee() ? 'ajouter-ecran-accueil' : 'non-supporte');
      if (Notification.permission === 'denied') return setEtat('refuse');
      const reg = await navigator.serviceWorker.register('/sw.js');
      const abonnement = await reg.pushManager.getSubscription();
      if (abonnement && Notification.permission === 'granted') {
        // Réenregistré à chaque visite : rattrape un appareil retiré côté serveur.
        await abonnerAppareil(abonnement.toJSON(), nomAppareil());
        setEtat('actif');
      } else setEtat('inactif');
    })().catch(() => setEtat('non-supporte'));
  }, []);

  const activer = () =>
    demarrer(async () => {
      setMessage(null);
      // Sur iPhone, la demande doit partir directement du geste (pas après un autre await).
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setEtat(permission === 'denied' ? 'refuse' : 'inactif');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const abonnement =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: cleServeur(clePublique),
          }));
        const { ok } = await abonnerAppareil(abonnement.toJSON(), nomAppareil());
        if (!ok) throw new Error('abonnement refusé par le serveur');
        setEtat('actif');
        setMessage('Notifications activées sur cet appareil.');
      } catch (e) {
        setMessage(`Activation impossible : ${e instanceof Error ? e.message : String(e)}`);
      }
    });

  const desactiver = () =>
    demarrer(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const abonnement = await reg?.pushManager.getSubscription();
      if (abonnement) {
        await desabonnerAppareil(abonnement.endpoint);
        await abonnement.unsubscribe();
      }
      setEtat('inactif');
      setMessage('Notifications désactivées sur cet appareil.');
    });

  const tester = () =>
    demarrer(async () => {
      await envoyerNotificationTest();
      setMessage('Notification de test demandée : elle arrive dans quelques secondes.');
    });

  return (
    <div className="bloc bg-surface p-4">
      {etat === 'chargement' && (
        <p className="text-[16px] text-gris">Vérification de cet appareil…</p>
      )}

      {etat === 'ajouter-ecran-accueil' && (
        <div className="text-[16px]">
          <p className="mb-2 font-bold">Sur iPhone, ajoute d’abord Tandhim à l’écran d’accueil.</p>
          <ol className="ml-5 list-decimal space-y-1">
            <li>Dans Safari, touche le bouton Partager.</li>
            <li>Choisis « Sur l’écran d’accueil ».</li>
            <li>
              Ouvre Tandhim depuis la nouvelle icône, puis reviens ici (Plus → Notifications).
            </li>
          </ol>
        </div>
      )}

      {etat === 'non-supporte' && (
        <p className="text-[16px]">
          Ce navigateur ne gère pas les notifications. Sur iPhone, il faut iOS 16.4 ou plus récent
          et l’app ouverte depuis l’écran d’accueil.
        </p>
      )}

      {etat === 'refuse' && (
        <p className="text-[16px]">
          Les notifications ont été refusées pour Tandhim. Sur iPhone : Réglages → Notifications →
          Tandhim → Autoriser. Sur PC : icône du cadenas dans la barre d’adresse → Notifications.
          Recharge ensuite cette page.
        </p>
      )}

      {etat === 'inactif' && (
        <div>
          <p className="mb-3 text-[16px]">
            Les notifications ne sont pas activées sur cet appareil.
          </p>
          <button
            type="button"
            onClick={activer}
            disabled={enCours}
            className={`${bouton} bg-jaune text-sur-couleur`}
          >
            {enCours ? 'Activation…' : 'Activer les notifications'}
          </button>
        </div>
      )}

      {etat === 'actif' && (
        <div>
          <p className="mb-3 text-[16px] font-semibold">Activées sur cet appareil.</p>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={tester}
              disabled={enCours}
              className={`${bouton} bg-jaune text-sur-couleur`}
            >
              Envoyer une notification de test
            </button>
            <button
              type="button"
              onClick={desactiver}
              disabled={enCours}
              className={`${bouton} bg-surface`}
            >
              Désactiver ici
            </button>
          </div>
        </div>
      )}

      <p aria-live="polite" className="mt-3 text-[15px] text-gris empty:hidden">
        {message}
      </p>
    </div>
  );
}
