/**
 * Messenger côté base : sondages (votes cumulés d'une synchro à l'autre), état de lecture
 * de chaque salon (où reprendre, derniers messages pour le contexte).
 */
import type { SondageLu, VoteLu } from '@tandhim/core';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from './client';
import { settings, sondagesMessenger } from './schema';

export type SondageMessenger = typeof sondagesMessenger.$inferSelect;

export function enregistrerSondage(db: Db, salon: string, s: SondageLu): void {
  db.insert(sondagesMessenger)
    .values({
      salon,
      eventId: s.id,
      auteur: s.auteur,
      creeLe: s.date.toISOString(),
      question: s.question,
      options: s.options,
    })
    .onConflictDoNothing()
    .run();
}

/** Ajoute des votes (le plus récent de chaque personne l'emporte). Renvoie les sondages touchés. */
export function appliquerVotes(db: Db, votes: VoteLu[], fins: string[] = []): string[] {
  const touches = new Set<string>();
  const ids = [...new Set([...votes.map((v) => v.sondageId), ...fins])];
  if (!ids.length) return [];
  const connus = new Map(
    db
      .select()
      .from(sondagesMessenger)
      .where(inArray(sondagesMessenger.eventId, ids))
      .all()
      .map((s) => [s.eventId, s]),
  );
  for (const v of votes) {
    const s = connus.get(v.sondageId);
    if (!s) continue; // vote d'un sondage plus ancien que l'historique lu
    const avant = s.votes[v.votant];
    if (!avant || avant.date <= v.date.toISOString()) {
      s.votes = { ...s.votes, [v.votant]: { date: v.date.toISOString(), choix: v.choix } };
      touches.add(s.eventId);
    }
  }
  for (const f of fins) {
    const s = connus.get(f);
    if (s && !s.clos) {
      s.clos = true;
      touches.add(f);
    }
  }
  for (const id of touches) {
    const s = connus.get(id)!;
    db.update(sondagesMessenger)
      .set({ votes: s.votes, clos: s.clos })
      .where(eq(sondagesMessenger.eventId, id))
      .run();
  }
  return [...touches];
}

export function sondagesParId(db: Db, ids: string[]): SondageMessenger[] {
  if (!ids.length) return [];
  return db.select().from(sondagesMessenger).where(inArray(sondagesMessenger.eventId, ids)).all();
}

export function marquerSondageEnvoye(db: Db, eventId: string, signature: string): void {
  db.update(sondagesMessenger)
    .set({ signatureEnvoyee: signature })
    .where(eq(sondagesMessenger.eventId, eventId))
    .run();
}

/** Valeur JSON libre rangée dans `settings` (état de lecture d'un salon…). */
export function lireReglage<T>(db: Db, cle: string): T | undefined {
  return db.select().from(settings).where(eq(settings.key, cle)).get()?.value as T | undefined;
}

export function ecrireReglage(db: Db, cle: string, valeur: unknown): void {
  db.insert(settings)
    .values({ key: cle, value: valeur })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: valeur, updatedAt: new Date().toISOString() },
    })
    .run();
}
