'use server';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { revalidatePath } from 'next/cache';
import { DELAIS_RAPPEL_HEURES, FICHIER_NOTIFICATION_TEST, loadEnv } from '@tandhim/core';
import { resolveDataDir } from '@tandhim/core/node';
import { enregistrerAbonnement, reglerDelaiRappel, supprimerAbonnement } from '@tandhim/db';
import { getDb } from '@/lib/db';

const texte = (v: unknown, max: number) =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;

/** Abonnement Web Push de l'appareil courant (objet `PushSubscription.toJSON()`). */
export async function abonnerAppareil(
  abonnement: { endpoint?: string; keys?: { p256dh?: string; auth?: string } },
  appareil: string,
): Promise<{ ok: boolean }> {
  const endpoint = texte(abonnement.endpoint, 1000);
  const p256dh = texte(abonnement.keys?.p256dh, 200);
  const auth = texte(abonnement.keys?.auth, 100);
  if (!endpoint?.startsWith('https://') || !p256dh || !auth) return { ok: false };
  enregistrerAbonnement(getDb().db, { endpoint, p256dh, auth, appareil: texte(appareil, 60) });
  revalidatePath('/plus/notifications');
  return { ok: true };
}

export async function desabonnerAppareil(endpoint: string): Promise<void> {
  supprimerAbonnement(getDb().db, endpoint);
  revalidatePath('/plus/notifications');
}

/** Le worker envoie la notification de test dans les secondes qui suivent. */
export async function envoyerNotificationTest(): Promise<void> {
  const dossier = resolveDataDir(loadEnv().DATA_DIR);
  writeFileSync(
    join(/*turbopackIgnore: true*/ dossier, FICHIER_NOTIFICATION_TEST),
    new Date().toISOString(),
  );
}

export async function reglerDelai(f: FormData): Promise<void> {
  const h = Number(f.get('heures'));
  if ((DELAIS_RAPPEL_HEURES as readonly number[]).includes(h)) reglerDelaiRappel(getDb().db, h);
  revalidatePath('/plus/notifications');
}
