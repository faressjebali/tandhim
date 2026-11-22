import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Cron } from 'croner';
import {
  APP_TIME_ZONE,
  FICHIER_NOTIFICATION_TEST,
  FICHIER_SYNCHRO_DEMANDEE,
  estModeDemo,
  formatTunis,
} from '@tandhim/core';
import { loadRepoEnv, resolveDataDir } from '@tandhim/core/node';
import {
  appliquerDemo,
  applySeed,
  backupDatabase,
  openDb,
  recalculerRevisions,
  syncEchouee,
  syncReussie,
  verifierSauvegarde,
} from '@tandhim/db';
import { runMigrations } from '@tandhim/db/migrate';
import { lancerMoteur } from './moteur';
import {
  envoyerRappels,
  envoyerTest,
  signalerNouvellesInfos,
  signalerPannes,
} from './notifications';
import { synchroniserClassroom } from './synchro/classroom';
import { synchroniserDrive } from './synchro/drive';
import { synchroniserGmail } from './synchro/gmail';
import { synchroniserMessenger } from './synchro/messenger';

const env = loadRepoEnv();
const log = (msg: string) =>
  console.log(`[worker ${formatTunis(new Date(), 'dd/MM HH:mm:ss')}] ${msg}`);

const dataDir = resolveDataDir(env.DATA_DIR);
/** Présent quand la base est migrée : sert au healthcheck Docker (le web attend ce signal). */
const readyFile = join(dataDir, '.worker-pret');
rmSync(readyFile, { force: true });

const { db, sqlite, path } = openDb(dataDir);
runMigrations(db);
const seed = applySeed(db);
// Mode démo : fausses données, aucune source externe, aucune notification.
const demo = estModeDemo();
if (demo && appliquerDemo(db)) log('mode démo : données fictives ajoutées');
log(
  `base prête (${path}) — ajouts : ${seed.subjects} matières, ${seed.weeks} semaines, ${seed.events} événements, ${seed.slots} cases ; événements corrigés : ${seed.eventsUpdated}, retirés : ${seed.eventsRemoved}`,
);
writeFileSync(readyFile, new Date().toISOString());

// Sauvegarde quotidienne à 03:00 (heure de Tunis), 14 jours conservés.
const backupJob = new Cron('0 3 * * *', { timezone: APP_TIME_ZONE, protect: true }, async () => {
  try {
    const file = await backupDatabase(sqlite, join(dataDir, 'backups'));
    const v = verifierSauvegarde(file);
    if (!v.ok) throw new Error(`sauvegarde abîmée (${v.integrite})`);
    const details = `${basename(file)} vérifiée : ${v.taches} tâche(s), ${v.messages} message(s), ${Math.round(v.octets / 1024)} Ko ; 14 jours gardés`;
    syncReussie(db, 'sauvegarde', 'Sauvegarde de la base', details);
    log(`sauvegarde : ${details}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    syncEchouee(db, 'sauvegarde', 'Sauvegarde de la base', msg);
    log(`ÉCHEC de la sauvegarde : ${msg}`);
  }
});
log(`prochaine sauvegarde : ${formatTunis(backupJob.nextRun() ?? new Date(), 'dd/MM HH:mm')}`);

/**
 * Garde-fou : une étape bloquée (appel réseau sans réponse) est abandonnée au bout de 20 min,
 * signalée dans « État des synchros », et les synchros suivantes repartent.
 */
const ETAPE_MAX_MS = 20 * 60_000;
async function etape(nom: string, f: () => Promise<unknown>) {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, ko) => {
    minuteur = setTimeout(
      () => ko(new Error(`${nom} : aucune réponse depuis 20 min, abandon`)),
      ETAPE_MAX_MS,
    );
  });
  try {
    await Promise.race([f(), delai]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    syncEchouee(db, 'worker', 'Synchros (worker)', msg);
    log(`synchro : ${msg}`);
  } finally {
    clearTimeout(minuteur);
  }
}

// Synchros externes (lecture seule) : toutes les 15 min, au démarrage, et à la demande de l'app.
let synchroEnCours = false;
/** Demande arrivée pendant une synchro : elle est relancée juste après, jamais perdue. */
let relancer: { raison: string; forcer: boolean } | null = null;
async function lancerSynchros(raison: string, forcer = false) {
  if (demo) return;
  if (synchroEnCours) {
    relancer = { raison, forcer: forcer || Boolean(relancer?.forcer) };
    return;
  }
  synchroEnCours = true;
  try {
    log(`synchro (${raison})`);
    await etape('Classroom', () => synchroniserClassroom(db, env, log, { forcer }));
    await etape('Gmail', () => synchroniserGmail(db, env, log, { forcer }));
    await etape('Drive', () => synchroniserDrive(db, env, log, { forcer }));
    await etape('Messenger', () => synchroniserMessenger(db, env, log, { forcer }));
    await etape('Moteur IA', () => lancerMoteur(db, env, log, { forcer }));
    // Nouvelles épreuves (DS, examens) ou dates changées : planning de révision à jour.
    recalculerRevisions(db);
  } catch (e) {
    log(`synchro : erreur inattendue ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    synchroEnCours = false;
  }
  if (relancer) {
    const suivante = relancer;
    relancer = null;
    await lancerSynchros(`${suivante.raison}, après la synchro en cours`, suivante.forcer);
  }
}
const synchroJob = new Cron('*/15 * * * *', { timezone: APP_TIME_ZONE, protect: true }, () =>
  lancerSynchros('planifiée'),
);
// Rappels d'échéance : vérifiés toutes les 5 min (protect : jamais deux passages en même temps).
const rappelsJob = new Cron('*/5 * * * *', { timezone: APP_TIME_ZONE, protect: true }, async () => {
  if (demo) return;
  try {
    await envoyerRappels(db, env, log);
    await signalerNouvellesInfos(db, env, log);
    // Pannes de plus de 3 h (Messenger, Google, Gemini…) : signalées une fois, avec quoi faire.
    await signalerPannes(db, env, log);
  } catch (e) {
    log(`notifications : erreur ${e instanceof Error ? e.message : String(e)}`);
  }
});
const demande = join(dataDir, FICHIER_SYNCHRO_DEMANDEE);
const test = join(dataDir, FICHIER_NOTIFICATION_TEST);
const surveillance = setInterval(() => {
  if (existsSync(demande)) {
    rmSync(demande, { force: true });
    void lancerSynchros('demandée depuis l’app', true);
  }
  if (existsSync(test)) {
    rmSync(test, { force: true });
    void envoyerTest(db, env, log).catch((e) =>
      log(`notifications : test en échec ${e instanceof Error ? e.message : String(e)}`),
    );
  }
}, 3_000);
setTimeout(() => void lancerSynchros('démarrage'), 20_000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    backupJob.stop();
    synchroJob.stop();
    rappelsJob.stop();
    clearInterval(surveillance);
    rmSync(readyFile, { force: true });
    sqlite.close();
    log(`arrêt (${signal})`);
    process.exit(0);
  });
}
