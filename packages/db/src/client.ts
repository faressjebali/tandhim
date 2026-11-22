import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;
export interface DbHandle {
  db: Db;
  sqlite: Database.Database;
  path: string;
}

export const DB_FILE_NAME = 'tandhim.db';

/** Ouvre (ou crée) la base SQLite dans `dataDir`, avec WAL et clés étrangères. */
export function openDb(dataDir: string, fileName = DB_FILE_NAME): DbHandle {
  const path =
    fileName === ':memory:' ? fileName : join(/*turbopackIgnore: true*/ dataDir, fileName);
  if (path !== ':memory:') mkdirSync(dirname(/*turbopackIgnore: true*/ path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return { db: drizzle(sqlite, { schema }), sqlite, path };
}
