/**
 * Migrations : utilisées par le worker, la CLI et les tests — pas par le web
 * (le bundler de Next ne doit pas embarquer le dossier des migrations).
 */
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './client';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Applique les migrations en attente (idempotent). */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
