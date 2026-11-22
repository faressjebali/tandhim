/**
 * Consignes cumulées des tâches (côté base) : enregistrement avec la règle de fiabilité
 * (toi > écrit > Messenger), lecture pour la page d'une tâche, pastille « Nouvelle info »,
 * notifications, et application d'une date proposée.
 */
import { type Aspect, type Niveau, effetConsigne, lienDuPassage } from '@tandhim/core';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { Db } from './client';
import { consignes, items, sourceItems, subjects } from './schema';

export type Consigne = typeof consignes.$inferSelect;

/** Consignes encore valables d'une tâche, en ordre chronologique, résumées pour l'affichage. */
export function resumeConsignes(db: Db, itemId: number): string | null {
  const actives = db
    .select()
    .from(consignes)
    .where(and(eq(consignes.itemId, itemId), eq(consignes.remplacee, false)))
    .orderBy(asc(consignes.dateInfo))
    .all();
  if (!actives.length) return null;
  if (actives.length === 1) return actives[0]!.texte;
  return actives
    .map((c) => {
      const d = new Date(c.dateInfo);
      const jour = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      return `${jour} : ${c.texte}${c.aVerifier ? ' (à vérifier)' : ''}`;
    })
    .join(' ; ');
}

export interface NouvelleConsigne {
  itemId: number;
  sourceItemId: number | null;
  niveau: Niveau;
  aspects: Aspect[];
  texte: string;
  dateInfo: string;
  /** Aspects que l'info modifie ou annule (vide : elle complète). */
  remplace: Aspect[];
  /** Marquer « à vérifier » quoi qu'il arrive (ex. date refusée car source moins fiable). */
  aVerifier?: boolean;
  echeanceProposee?: string | null;
  /** Fares doit la voir (tâche qu'il a modifiée, contradiction) : pastille « Nouvelle info ». */
  aVoir?: boolean;
  notifier?: boolean;
}

/**
 * Ajoute une consigne et applique la règle de fiabilité aux consignes actives. Une consigne au
 * texte identique déjà connue n'est pas dupliquée. Renvoie la consigne créée, ou null.
 */
export function enregistrerConsigne(db: Db, c: NouvelleConsigne): Consigne | null {
  const texte = c.texte.trim();
  if (!texte && !c.echeanceProposee) return null;
  const existantes = db.select().from(consignes).where(eq(consignes.itemId, c.itemId)).all();
  if (
    texte &&
    !c.echeanceProposee &&
    existantes.some((e) => e.texte.trim().toLowerCase() === texte.toLowerCase())
  )
    return null;
  const actives = existantes.filter((e) => !e.remplacee);
  const effet = effetConsigne(
    actives.map((a) => ({ id: a.id, niveau: a.niveau, aspects: a.aspects as Aspect[] })),
    { niveau: c.niveau, aspects: c.remplace, remplace: c.remplace.length > 0 },
  );
  return db.transaction((tx) => {
    if (effet.remplacees.length)
      tx.update(consignes)
        .set({ remplacee: true })
        .where(inArray(consignes.id, effet.remplacees))
        .run();
    return tx
      .insert(consignes)
      .values({
        itemId: c.itemId,
        sourceItemId: c.sourceItemId,
        niveau: c.niveau,
        aspects: c.aspects,
        texte: texte || 'Nouvelle date annoncée',
        dateInfo: c.dateInfo,
        aVerifier: effet.aVerifier || Boolean(c.aVerifier),
        echeanceProposee: c.echeanceProposee ?? null,
        vue: !(c.aVoir || effet.aVerifier || c.aVerifier),
        notifier: Boolean(c.notifier),
      })
      .returning()
      .get();
  });
}

export interface ConsigneVue extends Consigne {
  source: { type: string; direction: string; titre: string | null; lien: string | null } | null;
}

export function listerConsignes(db: Db, itemId: number): ConsigneVue[] {
  return db
    .select({ c: consignes, s: sourceItems })
    .from(consignes)
    .leftJoin(sourceItems, eq(consignes.sourceItemId, sourceItems.id))
    .where(eq(consignes.itemId, itemId))
    .orderBy(asc(consignes.dateInfo), asc(consignes.id))
    .all()
    .map(({ c, s }) => ({
      ...c,
      source: s
        ? {
            type: s.source,
            direction: s.direction,
            titre: s.title,
            lien: lienDuPassage(s.link, s.passages, c.texte),
          }
        : null,
    }));
}

/** Tâches ayant une info pas encore vue par Fares. */
export function tachesAvecNouvelleInfo(db: Db): Set<number> {
  return new Set(
    db
      .selectDistinct({ id: consignes.itemId })
      .from(consignes)
      .where(eq(consignes.vue, false))
      .all()
      .map((r) => r.id),
  );
}

export function marquerConsignesVues(db: Db, itemId: number): void {
  db.update(consignes)
    .set({ vue: true })
    .where(and(eq(consignes.itemId, itemId), eq(consignes.vue, false)))
    .run();
}

/** « Appliquer cette date » : la date proposée devient l'échéance (choix de Fares). */
export function appliquerDateConsigne(db: Db, consigneId: number): number | null {
  const c = db.select().from(consignes).where(eq(consignes.id, consigneId)).get();
  if (!c?.echeanceProposee) return null;
  db.transaction((tx) => {
    tx.update(items)
      .set({
        dueAt: c.echeanceProposee,
        dueAllDay: false,
        niveauEcheance: 'fares',
        lockedByUser: true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(items.id, c.itemId))
      .run();
    tx.update(consignes)
      .set({ vue: true, echeanceProposee: null, aVerifier: false })
      .where(eq(consignes.id, consigneId))
      .run();
  });
  return c.itemId;
}

/** Consignes à notifier : tâche visible (pas RT4/2) et pas terminée. */
export function consignesANotifier(db: Db) {
  return db
    .select({
      id: consignes.id,
      itemId: consignes.itemId,
      texte: consignes.texte,
      aVerifier: consignes.aVerifier,
      aspects: consignes.aspects,
      echeanceProposee: consignes.echeanceProposee,
      titre: items.title,
      matiere: subjects.code,
    })
    .from(consignes)
    .innerJoin(items, eq(consignes.itemId, items.id))
    .leftJoin(subjects, eq(items.subjectId, subjects.id))
    .where(
      and(
        eq(consignes.notifier, true),
        isNull(consignes.notifieeLe),
        ne(items.status, 'termine'),
        ne(items.groupe, 'RT4/2'),
      ),
    )
    .all();
}

export function marquerConsigneNotifiee(db: Db, id: number): void {
  db.update(consignes)
    .set({ notifieeLe: new Date().toISOString() })
    .where(eq(consignes.id, id))
    .run();
}
