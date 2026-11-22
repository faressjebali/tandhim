import { OAuth2Client } from 'google-auth-library';
import type { Env } from '@tandhim/core';
import { dechiffrer } from '@tandhim/core/node';

/** Client OAuth d'un compte connecté (jeton de rafraîchissement déchiffré à la volée). */
/** Délai maximal d'un appel aux API Google : un appel sans réponse ne bloque jamais les synchros. */
export const DELAI_GOOGLE_MS = 60_000;

export function authCompte(env: Env, refreshTokenEnc: string): OAuth2Client {
  const auth = new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });
  auth.setCredentials({ refresh_token: dechiffrer(refreshTokenEnc, env.ENCRYPTION_KEY) });
  return auth;
}

export function messageErreur(e: unknown): string {
  const err = e as {
    message?: string;
    response?: { data?: { error?: string | { message?: string }; error_description?: string } };
  };
  const data = err.response?.data;
  const d = data?.error;
  return (
    (typeof d === 'string'
      ? `${d}${data?.error_description ? ` (${data.error_description})` : ''}`
      : d?.message) ??
    err.message ??
    String(e)
  );
}

/** Jeton révoqué ou expiré : le compte doit être reconnecté par Fares. */
export const estAccesRevoque = (msg: string) =>
  /invalid_grant|unauthorized_client|invalid_client/i.test(msg);
