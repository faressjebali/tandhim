'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  authConfigured,
  createSessionToken,
  verifyPassword,
} from '@/lib/auth';

export type EtatConnexion = { erreur?: string };

/** Freine les essais en série : 5 échecs → 1 minute d'attente (par adresse). */
const echecs = new Map<string, { n: number; jusqua: number }>();
const MAX_ECHECS = 5;
const ATTENTE_MS = 60_000;

function destinationSure(suite: FormDataEntryValue | null): string {
  const s = typeof suite === 'string' ? suite : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : '/';
}

export async function seConnecter(_: EtatConnexion, form: FormData): Promise<EtatConnexion> {
  if (!authConfigured()) {
    return { erreur: 'Le mot de passe de l’app n’est pas encore configuré sur le serveur.' };
  }
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const etat = echecs.get(ip);
  if (etat && etat.n >= MAX_ECHECS && etat.jusqua > Date.now()) {
    const s = Math.ceil((etat.jusqua - Date.now()) / 1000);
    return { erreur: `Trop d’essais. Réessaie dans ${s} s.` };
  }

  const motDePasse = String(form.get('motDePasse') ?? '');
  if (!verifyPassword(motDePasse, process.env.APP_PASSWORD_HASH!)) {
    const n = (etat && etat.jusqua > Date.now() ? etat.n : 0) + 1;
    echecs.set(ip, { n, jusqua: Date.now() + ATTENTE_MS });
    return { erreur: 'Mot de passe incorrect.' };
  }

  echecs.delete(ip);
  (await cookies()).set(SESSION_COOKIE, createSessionToken()!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect(destinationSure(form.get('suite')));
}

export async function seDeconnecter(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/connexion');
}
