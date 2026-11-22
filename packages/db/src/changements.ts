/**
 * Changements de séance côté base : enregistrement (depuis le moteur IA), lecture pour
 * l'affichage, mise à l'écart par Fares, notifications.
 */
import {
  type ChangementSeance,
  type DayKey,
  type NatureChangement,
  type SlotCode,
  lienDuPassage,
} from '@tandhim/core';
import { and, eq, gte, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { Db } from './client';
import { changementsSeance, sourceItems, subjects } from './schema';

export interface NouveauChangement {
  subjectId: number;
  jour: DayKey;
  creneau: SlotCode | null;
  heure: string | null;
  /** RT4 par défaut ; RT4/2 est stocké mais masqué. */
  groupe?: 'RT4' | 'RT4/1' | 'RT4/2';
  nature: NatureChangement;
  nouveauJour: DayKey | null;
  nouveauCreneau: SlotCode | null;
  nouvelleHeure: string | null;
  lien: string | null;
  salle: string | null;
  sourceItemId: number | null;
  citation: string;
  /** 0 à 1. */
  confiance: number;
}

/**
 * Crée ou met à jour le changement de cette séance. Un changement écarté par Fares reste écarté.
 * Renvoie 'cree', 'maj' ou 'ignore'.
 */
export function enregistrerChangement(db: Db, c: NouveauChangement): 'cree' | 'maj' | 'ignore' {
  const existant = db
    .select()
    .from(changementsSeance)
    .where(
      and(
        eq(changementsSeance.subjectId, c.subjectId),
        eq(changementsSeance.jour, c.jour),
        eq(changementsSeance.groupe, c.groupe ?? 'RT4'),
        c.creneau !== null
          ? eq(changementsSeance.creneau, c.creneau)
          : and(
              isNull(changementsSeance.creneau),
              // Hors créneau : une séance par heure (le soir, un dimanche…).
              c.heure === null
                ? isNull(changementsSeance.heure)
                : eq(changementsSeance.heure, c.heure),
            ),
      ),
    )
    .get();
  const valeurs = {
    nature: c.nature,
    nouveauJour: c.nouveauJour,
    nouveauCreneau: c.nouveauCreneau,
    nouvelleHeure: c.nouvelleHeure,
    // Un message qui précise sans répéter le lien ou la salle ne les efface pas.
    lien: c.lien ?? existant?.lien ?? null,
    salle: c.salle ?? existant?.salle ?? null,
    sourceItemId: c.sourceItemId,
    citation: c.citation.slice(0, 300),
    confidence: Math.round(c.confiance * 100),
  };
  if (!existant) {
    db.insert(changementsSeance)
      .values({
        subjectId: c.subjectId,
        jour: c.jour,
        creneau: c.creneau,
        heure: c.heure,
        groupe: c.groupe ?? 'RT4',
        ...valeurs,
      })
      .run();
    return 'cree';
  }
  if (existant.ignore) return 'ignore';
  const change =
    existant.nature !== c.nature ||
    existant.nouveauJour !== c.nouveauJour ||
    existant.nouveauCreneau !== c.nouveauCreneau ||
    existant.nouvelleHeure !== c.nouvelleHeure;
  db.update(changementsSeance)
    .set({
      ...valeurs,
      // Une nouvelle information mérite une nouvelle notification.
      ...(change ? { notifieLe: null } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(changementsSeance.id, existant.id))
    .run();
  return 'maj';
}

const versVue = (r: {
  c: typeof changementsSeance.$inferSelect;
  matiere: string;
  lienSource: string | null;
  passages: { id: string; texte: string }[] | null;
}): ChangementSeance => ({
  id: r.c.id,
  matiere: r.matiere,
  jour: r.c.jour,
  creneau: r.c.creneau as SlotCode | null,
  heure: r.c.heure,
  nature: r.c.nature,
  nouveauJour: r.c.nouveauJour,
  nouveauCreneau: r.c.nouveauCreneau as SlotCode | null,
  nouvelleHeure: r.c.nouvelleHeure,
  lien: r.c.lien,
  salle: r.c.salle,
  // Message exact de la conversation (citation de l'IA), pas le début de la conversation.
  lienSource: lienDuPassage(r.lienSource, r.passages, r.c.citation),
  aVerifier: (r.c.confidence ?? 100) < 60,
});

function selection(db: Db) {
  return db
    .select({
      c: changementsSeance,
      matiere: subjects.code,
      lienSource: sourceItems.link,
      passages: sourceItems.passages,
    })
    .from(changementsSeance)
    .innerJoin(subjects, eq(changementsSeance.subjectId, subjects.id))
    .leftJoin(sourceItems, eq(changementsSeance.sourceItemId, sourceItems.id));
}

/** Changements qui touchent un jour entre `du` et `au` (jour d'origine ou nouveau jour). */
export function listerChangements(db: Db, du: DayKey, au: DayKey): ChangementSeance[] {
  return selection(db)
    .where(
      and(
        eq(changementsSeance.ignore, false),
        ne(changementsSeance.groupe, 'RT4/2'),
        or(
          and(gte(changementsSeance.jour, du), lte(changementsSeance.jour, au)),
          and(gte(changementsSeance.nouveauJour, du), lte(changementsSeance.nouveauJour, au)),
        ),
      ),
    )
    .all()
    .map(versVue);
}

export function ignorerChangement(db: Db, id: number): void {
  db.update(changementsSeance)
    .set({ ignore: true, updatedAt: new Date().toISOString() })
    .where(eq(changementsSeance.id, id))
    .run();
}

/** Changements pas encore notifiés qui touchent les jours `du`…`au`. */
export function changementsANotifier(db: Db, du: DayKey, au: DayKey): ChangementSeance[] {
  return selection(db)
    .where(
      and(
        eq(changementsSeance.ignore, false),
        ne(changementsSeance.groupe, 'RT4/2'),
        isNull(changementsSeance.notifieLe),
        or(
          and(gte(changementsSeance.jour, du), lte(changementsSeance.jour, au)),
          and(gte(changementsSeance.nouveauJour, du), lte(changementsSeance.nouveauJour, au)),
        ),
      ),
    )
    .all()
    .map(versVue);
}

export function marquerChangementNotifie(db: Db, id: number): void {
  db.update(changementsSeance)
    .set({ notifieLe: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` })
    .where(eq(changementsSeance.id, id))
    .run();
}
