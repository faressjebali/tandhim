import 'server-only';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import { FICHIER_SYNCHRO_DEMANDEE, loadEnv } from '@tandhim/core';
import { resolveDataDir } from '@tandhim/core/node';

export const COOKIE_ETAT_OAUTH = 'tandhim_oauth';

/** Client OAuth Google de l'app (adresse de retour : APP_URL/api/google/retour). */
export function clientGoogle(): OAuth2Client {
  const env = loadEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants dans .env');
  }
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${env.APP_URL.replace(/\/$/, '')}/api/google/retour`,
  });
}

/** Demande au worker une synchro immédiate (il surveille ce fichier toutes les 10 s). */
export function demanderSynchro(): void {
  const dossier = resolveDataDir(loadEnv().DATA_DIR);
  writeFileSync(
    join(/*turbopackIgnore: true*/ dossier, FICHIER_SYNCHRO_DEMANDEE),
    new Date().toISOString(),
  );
}
