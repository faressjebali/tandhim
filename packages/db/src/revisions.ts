/**
 * Planning de révision côté base : épreuves à venir, recalcul du planning, séances cochables.
 */
import {
  type Epreuve,
  REGLAGES_REVISION_DEFAUT,
  type ReglagesRevision,
  planifierRevisions,
  tunisDayKey,
} from '@tandhim/core';
import { and, asc, eq, gt, gte, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import type { Db } from './client';
import { loadCalendarData } from './queries';
import { items, seancesRevision, settings, subjects } from './schema';

const CLE_REGLAGES = 'revisions.reglages';
const TYPES_EPREUVE = ['ds', 'examen'] as const;

export function reglagesRevision(db: Db): ReglagesRevision {
  const v = db.select().from(settings).where(eq(settings.key, CLE_REGLAGES)).get()?.value;
  return { ...REGLAGES_REVISION_DEFAUT, ...(typeof v === 'object' && v ? v : {}) };
}

export function reglerRevision(db: Db, r: Partial<ReglagesRevision>): void {
  const valeur = { ...reglagesRevision(db), ...r };
  db.insert(settings)
    .values({ key: CLE_REGLAGES, value: valeur })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: valeur, updatedAt: new Date().toISOString() },
    })
    .run();
}

/** Épreuves datées à venir (tâches de type DS ou examen, non terminées). */
export function epreuvesAVenir(db: Db, maintenant: Date = new Date()): Epreuve[] {
  return db
    .select({ id: items.id, titre: items.title, matiere: subjects.code, dueAt: items.dueAt })
    .from(items)
    .leftJoin(subjects, eq(items.subjectId, subjects.id))
    .where(
      and(
        inArray(items.type, [...TYPES_EPREUVE]),
        ne(items.status, 'termine'),
        ne(items.groupe, 'RT4/2'),
        isNotNull(items.dueAt),
        gt(items.dueAt, maintenant.toISOString()),
      ),
    )
    .orderBy(asc(items.dueAt))
    .all()
    .map((e) => ({ id: e.id, titre: e.titre, matiere: e.matiere, debut: new Date(e.dueAt!) }));
}

/**
 * Recalcule le planning : les séances à venir non faites sont remplacées ; les séances faites
 * (et les passées) restent, et les faites comptent dans le nombre prévu par épreuve.
 */
export function recalculerRevisions(db: Db, maintenant: Date = new Date()): number {
  const epreuves = epreuvesAVenir(db, maintenant);
  const faites = new Map<number, number>();
  for (const s of db
    .select({ itemId: seancesRevision.itemId })
    .from(seancesRevision)
    .where(eq(seancesRevision.faite, true))
    .all()) {
    faites.set(s.itemId, (faites.get(s.itemId) ?? 0) + 1);
  }
  const plan = planifierRevisions(
    epreuves,
    loadCalendarData(db),
    tunisDayKey(maintenant),
    maintenant,
    reglagesRevision(db),
    faites,
  );
  // Les séances déjà faites occupent leur créneau : on n'en replanifie pas une par-dessus.
  const gardees = db
    .select()
    .from(seancesRevision)
    .where(
      and(eq(seancesRevision.faite, true), gt(seancesRevision.debut, maintenant.toISOString())),
    )
    .all();
  db.transaction((tx) => {
    tx.delete(seancesRevision)
      .where(
        and(eq(seancesRevision.faite, false), gt(seancesRevision.debut, maintenant.toISOString())),
      )
      .run();
    for (const s of plan) {
      const debut = s.debut.toISOString();
      if (gardees.some((g) => g.debut === debut)) continue;
      tx.insert(seancesRevision)
        .values({ itemId: s.epreuveId, debut, fin: s.fin.toISOString() })
        .run();
    }
  });
  return plan.length;
}

export interface SeanceRevision {
  id: number;
  debut: Date;
  fin: Date;
  faite: boolean;
  epreuve: { id: number; titre: string; date: Date | null };
  matiere: { code: string; nom: string; couleur: string } | null;
}

export function listerSeancesRevision(db: Db, du: Date, au: Date): SeanceRevision[] {
  return db
    .select({
      s: seancesRevision,
      titre: items.title,
      dueAt: items.dueAt,
      code: subjects.code,
      nom: subjects.name,
      couleur: subjects.color,
    })
    .from(seancesRevision)
    .innerJoin(items, eq(seancesRevision.itemId, items.id))
    .leftJoin(subjects, eq(items.subjectId, subjects.id))
    .where(
      and(
        gte(seancesRevision.debut, du.toISOString()),
        lte(seancesRevision.debut, au.toISOString()),
      ),
    )
    .orderBy(asc(seancesRevision.debut))
    .all()
    .map((r) => ({
      id: r.s.id,
      debut: new Date(r.s.debut),
      fin: new Date(r.s.fin),
      faite: r.s.faite,
      epreuve: { id: r.s.itemId, titre: r.titre, date: r.dueAt ? new Date(r.dueAt) : null },
      matiere: r.code ? { code: r.code, nom: r.nom!, couleur: r.couleur! } : null,
    }));
}

export function basculerSeanceRevision(db: Db, id: number, faite: boolean): void {
  db.update(seancesRevision).set({ faite }).where(eq(seancesRevision.id, id)).run();
}
