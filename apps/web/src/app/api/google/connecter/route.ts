import { randomBytes } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { GOOGLE_SCOPES } from '@tandhim/core';
import { COOKIE_ETAT_OAUTH, clientGoogle } from '@/lib/google';

/** Lance la connexion d'un compte Google (fac ou perso), en lecture seule. */
export function GET(request: NextRequest) {
  const libelle = request.nextUrl.searchParams.get('compte') === 'perso' ? 'perso' : 'fac';
  // Jeton anti-falsification : la réponse de Google doit le renvoyer à l'identique.
  const etat = randomBytes(24).toString('base64url');
  const url = clientGoogle().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: GOOGLE_SCOPES,
    state: etat,
  });
  const reponse = NextResponse.redirect(url);
  reponse.cookies.set(COOKIE_ETAT_OAUTH, JSON.stringify({ etat, libelle }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/google',
    maxAge: 600,
  });
  return reponse;
}
