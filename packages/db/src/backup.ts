import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tunisDayKey } from '@tandhim/core';
import BetterSqlite from 'better-sqlite3';
import type Database from 'better-sqlite3';

export const BACKUP_PREFIX = 'tandhim-';

/**
 * Sauvegarde à chaud (API de sauvegarde SQLite, compatible WAL) dans `dir`,
 * un fichier par jour (heure de Tunis), en gardant les `keep` plus récents.
 */
export async function backupDatabase(
  sqlite: Database.Database,
  dir: string,
  keep = 14,
  now: Date = new Date(),
): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${BACKUP_PREFIX}${tunisDayKey(now)}.db`);
  await sqlite.backup(file);
  // Fichier autonome : sans journal WAL, il se copie et s'ouvre sans fichiers -wal / -shm.
  const copie = new BetterSqlite(file);
  copie.pragma('journal_mode = DELETE');
  copie.close();
  const old = readdirSync(dir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith('.db'))
    .sort()
    .reverse()
    .slice(keep);
  for (const f of old) rmSync(join(dir, f), { force: true });
  return file;
}

export interface VerificationSauvegarde {
  ok: boolean;
  /** « ok » ou le premier problème signalé par SQLite. */
  integrite: string;
  taches: number;
  messages: number;
  octets: number;
}

/** Ouvre la sauvegarde en lecture seule et vérifie qu'elle est intacte et utilisable. */
export function verifierSauvegarde(fichier: string): VerificationSauvegarde {
  const copie = new BetterSqlite(fichier, { readonly: true, fileMustExist: true });
  try {
    const integrite = String(copie.pragma('integrity_check', { simple: true }));
    const compter = (table: string) =>
      (copie.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
    return {
      ok: integrite === 'ok',
      integrite,
      taches: compter('items'),
      messages: compter('source_items'),
      octets: statSync(fichier).size,
    };
  } finally {
    copie.close();
  }
}
