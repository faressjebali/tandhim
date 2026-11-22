/**
 * Notifications côté base : appareils abonnés, délai de rappel, échéances à rappeler.
 */
import { DELAI_RAPPEL_DEFAUT_HEURES, rappelDu } from '@tandhim/core';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import type { Db } from './client';
import { items, notificationsEnvoyees, pushSubscriptions, settings, subjects } from './schema';

export type Abonnement = typeof pushSubscriptions.$inferSelect;

const CLE_DELAI = 'notifications.delaiHeures';

export function enregistrerAbonnement(
  db: Db,
  a: { endpoint: string; p256dh: string; auth: string; appareil: string | null },
): void {
  db.insert(pushSubscriptions)
    .values(a)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: a.p256dh, auth: a.auth, appareil: a.appareil, lastError: null },
    })
    .run();
}

export function supprimerAbonnement(db: Db, endpoint: string): void {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

export const listerAbonnements = (db: Db): Abonnement[] =>
  db.select().from(pushSubscriptions).all();

export function resultatEnvoi(db: Db, id: number, erreur: string | null): void {
  db.update(pushSubscriptions)
    .set(
      erreur ? { lastError: erreur } : { lastSuccessAt: new Date().toISOString(), lastError: null },
    )
    .where(eq(pushSubscriptions.id, id))
    .run();
}

export function delaiRappelHeures(db: Db): number {
  const v = db.select().from(settings).where(eq(settings.key, CLE_DELAI)).get()?.value;
  return typeof v === 'number' && v > 0 ? v : DELAI_RAPPEL_DEFAUT_HEURES;
}

export function reglerDelaiRappel(db: Db, heures: number): void {
  db.insert(settings)
    .values({ key: CLE_DELAI, value: heures })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: heures, updatedAt: new Date().toISOString() },
    })
    .run();
}

export interface Rappel {
  itemId: number;
  titre: string;
  matiere: string | null;
  echeance: Date;
  jourEntier: boolean;
  dueAt: string;
}

/** Tâches non terminées dont le rappel est dû maintenant et pas encore envoyé pour cette échéance. */
export function rappelsDus(db: Db, maintenant: Date = new Date()): Rappel[] {
  const delai = delaiRappelHeures(db);
  const lignes = db
    .select({
      itemId: items.id,
      titre: items.title,
      matiere: subjects.code,
      dueAt: items.dueAt,
      jourEntier: items.dueAllDay,
      dejaEnvoye: notificationsEnvoyees.id,
    })
    .from(items)
    .leftJoin(subjects, eq(items.subjectId, subjects.id))
    .leftJoin(
      notificationsEnvoyees,
      and(
        eq(notificationsEnvoyees.itemId, items.id),
        eq(notificationsEnvoyees.kind, 'echeance'),
        eq(notificationsEnvoyees.dueAt, items.dueAt),
      ),
    )
    .where(and(ne(items.status, 'termine'), ne(items.groupe, 'RT4/2'), isNotNull(items.dueAt)))
    .all();
  return lignes.flatMap((l) => {
    if (l.dejaEnvoye || !l.dueAt) return [];
    const echeance = new Date(l.dueAt);
    if (!rappelDu(echeance, delai, maintenant)) return [];
    return [
      {
        itemId: l.itemId,
        titre: l.titre,
        matiere: l.matiere,
        echeance,
        jourEntier: l.jourEntier,
        dueAt: l.dueAt,
      },
    ];
  });
}

export function marquerRappelEnvoye(db: Db, itemId: number, dueAt: string): void {
  db.insert(notificationsEnvoyees)
    .values({ itemId, kind: 'echeance', dueAt })
    .onConflictDoNothing()
    .run();
}
