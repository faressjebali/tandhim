/**
 * pnpm db:migrate | pnpm db:seed — sur la base de DATA_DIR (racine du dépôt par défaut).
 */
import { loadRepoEnv, resolveDataDir } from '@tandhim/core/node';
import { applySeed, openDb } from './index';
import { runMigrations } from './migrate';

const command = process.argv[2];
const env = loadRepoEnv();
const { db, sqlite, path } = openDb(resolveDataDir(env.DATA_DIR));

try {
  runMigrations(db);
  console.log(`✅ Migrations appliquées sur ${path}`);
  if (command === 'seed') {
    const r = applySeed(db);
    console.log(
      `✅ Données de départ : ${r.subjects} matière(s), ${r.weeks} semaine(s), ${r.events} événement(s), ${r.slots} case(s) ajoutées (0 = déjà présentes) ; ${r.eventsUpdated} événement(s) corrigé(s), ${r.eventsRemoved} retiré(s).`,
    );
  }
} finally {
  sqlite.close();
}
