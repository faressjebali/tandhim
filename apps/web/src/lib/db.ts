import 'server-only';
import { loadEnv } from '@tandhim/core';
import { resolveDataDir } from '@tandhim/core/node';
import { type DbHandle, openDb } from '@tandhim/db';

/**
 * Connexion unique à la base, partagée par toutes les requêtes du serveur web.
 * Les migrations sont appliquées par le worker (le web attend qu'il soit prêt).
 */
const globalForDb = globalThis as unknown as { tandhimDb?: DbHandle };

export function getDb(): DbHandle {
  globalForDb.tandhimDb ??= openDb(resolveDataDir(loadEnv().DATA_DIR));
  return globalForDb.tandhimDb;
}
