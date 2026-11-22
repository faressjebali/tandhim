import { type NextRequest, NextResponse } from 'next/server';
import { loadEnv } from '@tandhim/core';
import { chiffrer } from '@tandhim/core/node';
import { enregistrerCompte } from '@tandhim/db';
import { getDb } from '@/lib/db';
import { COOKIE_ETAT_OAUTH, clientGoogle, demanderSynchro } from '@/lib/google';

/** Retour de Google : vérifie l'état, enregistre le jeton (chiffré) et lance une synchro. */
export async function GET(request: NextRequest) {
  const env = loadEnv();
  const vers = (params: string) => {
    const r = NextResponse.redirect(new URL(`/plus/comptes?${params}`, env.APP_URL));
    r.cookies.delete({ name: COOKIE_ETAT_OAUTH, path: '/api/google' });
    return r;
  };
  const q = request.nextUrl.searchParams;
  if (q.get('error'))
    return vers(`erreur=${encodeURIComponent(`Google a répondu : ${q.get('error')}`)}`);

  let attendu: { etat?: string; libelle?: string } = {};
  try {
    attendu = JSON.parse(request.cookies.get(COOKIE_ETAT_OAUTH)?.value ?? '{}');
  } catch {
    /* cookie illisible : traité comme absent */
  }
  if (!attendu.etat || attendu.etat !== q.get('state') || !q.get('code')) {
    return vers(`erreur=${encodeURIComponent('Connexion expirée ou invalide, recommence.')}`);
  }

  try {
    const client = clientGoogle();
    const { tokens } = await client.getToken(q.get('code')!);
    if (!tokens.refresh_token || !tokens.access_token) {
      return vers(
        `erreur=${encodeURIComponent('Google n’a pas fourni d’accès durable. Retire l’accès de Tandhim dans ton compte Google puis recommence.')}`,
      );
    }
    const info = await client.getTokenInfo(tokens.access_token);
    if (!info.email) return vers(`erreur=${encodeURIComponent('Adresse du compte introuvable.')}`);
    enregistrerCompte(getDb().db, {
      email: info.email,
      label: attendu.libelle === 'perso' ? 'perso' : 'fac',
      refreshTokenEnc: chiffrer(tokens.refresh_token, env.ENCRYPTION_KEY),
      scopes: info.scopes.join(' '),
    });
    demanderSynchro();
    return vers(`ok=${encodeURIComponent(info.email)}`);
  } catch (e) {
    return vers(`erreur=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
}
