/**
 * Utilitaires réservés au serveur (Node) : système de fichiers, .env.
 * Importer via `@tandhim/core/node`, jamais depuis un composant client.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { type Env, loadEnv } from './env';

/** Racine du dépôt (dossier contenant pnpm-workspace.yaml), ou le dossier courant. */
export function findRepoRoot(from: string = process.cwd()): string {
  let dir = resolve(/*turbopackIgnore: true*/ from);
  for (;;) {
    if (existsSync(join(/*turbopackIgnore: true*/ dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(/*turbopackIgnore: true*/ from);
    dir = parent;
  }
}

/** Charge le .env de la racine du dépôt s'il existe (en local), puis valide les variables. */
export function loadRepoEnv(): Env {
  const file = join(/*turbopackIgnore: true*/ findRepoRoot(), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
  return loadEnv();
}

/** Dossier des données, absolu. Un chemin relatif est pris depuis la racine du dépôt. */
export function resolveDataDir(dataDir: string): string {
  return isAbsolute(dataDir) ? dataDir : resolve(/*turbopackIgnore: true*/ findRepoRoot(), dataDir);
}

// ---------------------------------------------------------------------------
// Chiffrement des secrets stockés en base (jetons OAuth) : AES-256-GCM.
// Clé : ENCRYPTION_KEY = 32 octets encodés en base64 (`openssl rand -base64 32`).
// ---------------------------------------------------------------------------

function cleDepuis(encodee: string | undefined): Buffer {
  const cle = Buffer.from(encodee ?? '', 'base64');
  if (cle.length !== 32) {
    throw new Error('ENCRYPTION_KEY manquante ou invalide (32 octets en base64 attendus).');
  }
  return cle;
}

export function chiffrer(texte: string, cleBase64: string | undefined): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', cleDepuis(cleBase64), iv);
  const donnees = Buffer.concat([c.update(texte, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), donnees]
    .map((x) => (typeof x === 'string' ? x : x.toString('base64url')))
    .join(':');
}

export function dechiffrer(paquet: string, cleBase64: string | undefined): string {
  const [version, iv, tag, donnees] = paquet.split(':');
  if (version !== 'v1' || !iv || !tag || !donnees) throw new Error('Secret chiffré illisible.');
  const d = createDecipheriv('aes-256-gcm', cleDepuis(cleBase64), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(donnees, 'base64url')), d.final()]).toString('utf8');
}
