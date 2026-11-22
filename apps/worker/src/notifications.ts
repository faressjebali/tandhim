/**
 * Envoi des notifications Web Push (iPhone en PWA, navigateur du PC) : rappels d'échéance
 * et notification de test demandée depuis l'app. Échecs visibles dans « État des synchros ».
 */
import {
  type Env,
  addDaysToKey,
  conseilPanne,
  estLaNuit,
  panneAAlerter,
  instantsDuChangement,
  texteChangement,
  texteRappel,
  tunisDayKey,
} from '@tandhim/core';
import {
  type Abonnement,
  type Db,
  changementsANotifier,
  consignesANotifier,
  marquerConsigneNotifiee,
  ecrireReglage,
  lireReglage,
  listerEtatsSync,
  listerAbonnements,
  marquerChangementNotifie,
  marquerRappelEnvoye,
  rappelsDus,
  resultatEnvoi,
  supprimerAbonnement,
  syncEchouee,
  syncReussie,
} from '@tandhim/db';
import webpush, { WebPushError } from 'web-push';

const CLE = 'notifications';
const LIBELLE = 'Notifications';

export interface Message {
  titre: string;
  corps: string;
  /** Page ouverte quand on touche la notification. */
  url: string;
  /** Une notification de même tag remplace la précédente au lieu de s'empiler. */
  tag: string;
}

const configure = (env: Env) => {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.APP_URL, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return true;
};

/** Envoie à tous les appareils ; renvoie le nombre d'appareils atteints et la dernière erreur. */
async function diffuser(db: Db, abonnements: Abonnement[], m: Message) {
  let atteints = 0;
  let erreur: string | null = null;
  for (const a of abonnements) {
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        JSON.stringify(m),
        { TTL: 12 * 3600, urgency: 'high' },
      );
      resultatEnvoi(db, a.id, null);
      atteints++;
    } catch (e) {
      if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
        // Abonnement expiré (app supprimée de l'écran d'accueil, autorisation retirée…).
        supprimerAbonnement(db, a.endpoint);
        continue;
      }
      erreur =
        e instanceof WebPushError
          ? `${a.appareil ?? 'appareil'} : ${e.statusCode} ${e.body || e.message}`.trim()
          : `${a.appareil ?? 'appareil'} : ${e instanceof Error ? e.message : String(e)}`;
      resultatEnvoi(db, a.id, erreur);
    }
  }
  return { atteints, erreur };
}

export async function envoyerRappels(db: Db, env: Env, log: (m: string) => void) {
  if (!configure(env)) return;
  const abonnements = listerAbonnements(db);
  if (!abonnements.length) return; // Rien n'est marqué envoyé : ils partiront après l'abonnement.
  const maintenant = new Date();
  const rappels = rappelsDus(db, maintenant);
  let envoyes = 0;
  let derniereErreur: string | null = null;
  for (const r of rappels) {
    const { titre, corps } = texteRappel(r, maintenant);
    const { atteints, erreur } = await diffuser(db, abonnements, {
      titre,
      corps,
      url: `/taches/${r.itemId}`,
      tag: `tache-${r.itemId}`,
    });
    if (atteints) {
      marquerRappelEnvoye(db, r.itemId, r.dueAt);
      envoyes++;
    }
    derniereErreur = erreur ?? derniereErreur;
  }

  // Changements de séance touchant les prochaines 48 h (jamais la nuit : ils attendent 07:30).
  let changements = 0;
  if (!estLaNuit(maintenant)) {
    const limite = maintenant.getTime() + 48 * 3_600_000;
    const aujourdhui = tunisDayKey(maintenant);
    for (const c of changementsANotifier(db, aujourdhui, addDaysToKey(aujourdhui, 2))) {
      const proche = instantsDuChangement(c).some((t) => t > maintenant && t.getTime() <= limite);
      if (!proche) continue;
      const { titre, corps } = texteChangement(c);
      const { atteints, erreur } = await diffuser(db, abonnements, {
        titre,
        corps,
        url: c.nature === 'en_ligne' && c.lien ? c.lien : `/?jour=${c.jour}`,
        tag: `seance-${c.id}`,
      });
      if (atteints) {
        marquerChangementNotifie(db, c.id);
        changements++;
      }
      derniereErreur = erreur ?? derniereErreur;
    }
  }

  if (derniereErreur) syncEchouee(db, CLE, LIBELLE, derniereErreur);
  else if (envoyes || changements)
    syncReussie(
      db,
      CLE,
      LIBELLE,
      `${envoyes} rappel(s) et ${changements} changement(s) de séance envoyés`,
    );
  if (envoyes || changements)
    log(`notifications : ${envoyes} rappel(s), ${changements} changement(s) de séance`);
}

const LIBELLES_ASPECTS: Record<string, string> = {
  date: 'date',
  lieu: 'lieu',
  rendu: 'mode de rendu',
  modalites: 'modalités',
};

/**
 * Nouvelle info sur une tâche (date, lieu, mode de rendu, modalités) : une notification par
 * info, jamais la nuit. Une info moins fiable (Messenger contre un écrit du prof) est signalée
 * « à vérifier ».
 */
export async function signalerNouvellesInfos(db: Db, env: Env, log: (m: string) => void) {
  if (!configure(env) || estLaNuit(new Date())) return;
  const abonnements = listerAbonnements(db);
  if (!abonnements.length) return;
  for (const c of consignesANotifier(db)) {
    const quoi = (c.aspects as string[])
      .map((a) => LIBELLES_ASPECTS[a])
      .filter(Boolean)
      .join(', ');
    const { atteints } = await diffuser(db, abonnements, {
      titre: `${c.matiere ? `${c.matiere} · ` : ''}nouvelle info${quoi ? ` (${quoi})` : ''}${c.aVerifier ? ' à vérifier' : ''}`,
      corps: `${c.titre} : ${c.texte}`.slice(0, 180),
      url: `/taches/${c.itemId}`,
      tag: `info-${c.itemId}`,
    });
    if (atteints) {
      marquerConsigneNotifiee(db, c.id);
      log(`notifications : nouvelle info signalée (${c.titre})`);
    }
  }
}

/**
 * Pannes : une source qui échoue depuis plus de 3 h est signalée une fois par panne
 * (jamais la nuit), avec la raison et quoi faire.
 */
export async function signalerPannes(db: Db, env: Env, log: (m: string) => void) {
  if (!configure(env)) return;
  const maintenant = new Date();
  if (estLaNuit(maintenant)) return;
  const abonnements = listerAbonnements(db);
  if (!abonnements.length) return;
  for (const e of listerEtatsSync(db)) {
    const cle = `alerte.${e.key}`;
    if (!panneAAlerter(e, lireReglage<string>(db, cle), maintenant)) continue;
    const depuis = Math.round(
      (maintenant.getTime() - new Date(e.enEchecDepuis!).getTime()) / 3_600_000,
    );
    const { atteints } = await diffuser(db, abonnements, {
      titre: `${e.label} : en panne depuis ${depuis} h`,
      corps: `${(e.lastError ?? 'erreur inconnue').slice(0, 120)}. ${conseilPanne(e.key, e.lastError ?? '')}`,
      url: '/plus/synchros',
      tag: `panne-${e.key}`,
    });
    if (atteints) {
      ecrireReglage(db, cle, e.enEchecDepuis);
      log(`notifications : panne signalée (${e.label})`);
    }
  }
}

export async function envoyerTest(db: Db, env: Env, log: (m: string) => void) {
  if (!configure(env)) {
    syncEchouee(db, CLE, LIBELLE, 'clés VAPID absentes du .env du serveur');
    return;
  }
  const abonnements = listerAbonnements(db);
  const { atteints, erreur } = await diffuser(db, abonnements, {
    titre: 'Tandhim',
    corps: 'Les notifications fonctionnent sur cet appareil.',
    url: '/plus/notifications',
    tag: 'test',
  });
  if (erreur) syncEchouee(db, CLE, LIBELLE, erreur);
  else syncReussie(db, CLE, LIBELLE, `test envoyé à ${atteints} appareil(s)`);
  log(`notifications : test envoyé à ${atteints}/${abonnements.length} appareil(s)`);
}
