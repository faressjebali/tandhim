/**
 * Applique les données de départ. Idempotent : peut être relancé à chaque démarrage.
 * Ne touche jamais une ligne corrigée par Fares (`lockedByUser`) ni créée par une autre source.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import {
  academicEvents,
  academicWeeks,
  semesters,
  subjects,
  timetableSlots,
  timetables,
} from '../schema';
import { EVENTS, SEMESTERS, SUBJECTS, TIMETABLE_S1, WEEKS } from './data';

export interface SeedReport {
  subjects: number;
  subjectsUpdated: number;
  weeks: number;
  events: number;
  eventsUpdated: number;
  eventsRemoved: number;
  slots: number;
}

export function applySeed(db: Db): SeedReport {
  return db.transaction((tx) => {
    const report: SeedReport = {
      subjects: 0,
      subjectsUpdated: 0,
      weeks: 0,
      events: 0,
      eventsUpdated: 0,
      eventsRemoved: 0,
      slots: 0,
    };

    // Matières : ajoutées si absentes ; mises à jour si la liste de départ change,
    // sauf celles que Fares a modifiées (lockedByUser).
    const subjectRows = new Map(
      tx
        .select()
        .from(subjects)
        .all()
        .map((r) => [r.code, r]),
    );
    for (const s of SUBJECTS) {
      const row = subjectRows.get(s.code);
      if (!row) {
        tx.insert(subjects).values(s).run();
        report.subjects++;
        continue;
      }
      const voulu = { ...s, notes: s.notes ?? null };
      const change =
        row.name !== voulu.name ||
        row.teacher !== voulu.teacher ||
        row.color !== voulu.color ||
        row.notes !== voulu.notes ||
        row.submissionsViaClassroom !== voulu.submissionsViaClassroom ||
        JSON.stringify(row.aliases) !== JSON.stringify(voulu.aliases);
      if (change && !row.lockedByUser) {
        tx.update(subjects)
          .set({ ...voulu, updatedAt: new Date().toISOString() })
          .where(eq(subjects.id, row.id))
          .run();
        report.subjectsUpdated++;
      }
    }

    for (const s of SEMESTERS) tx.insert(semesters).values(s).onConflictDoNothing().run();
    const semesterIds = new Map(
      tx
        .select()
        .from(semesters)
        .all()
        .filter((s) => s.academicYear === '2026/2027')
        .map((s) => [s.number, s.id]),
    );

    for (const w of WEEKS) {
      const semesterId = semesterIds.get(w.semester);
      if (!semesterId) throw new Error(`Semestre ${w.semester} introuvable`);
      report.weeks += tx
        .insert(academicWeeks)
        .values({ semesterId, number: w.number, letter: w.letter, startDate: w.startDate })
        .onConflictDoNothing()
        .run().changes;
    }

    // Événements du calendrier : la liste de départ fait foi pour les lignes qu'elle a créées
    // (source « seed ») — corrigées ou retirées si elle change — sauf si Fares les a modifiées.
    const keyOf = (e: { kind: string; title: string; startDate: string }) =>
      `${e.kind}|${e.title}|${e.startDate}`;
    const existing = new Map(
      tx
        .select()
        .from(academicEvents)
        .all()
        .map((r) => [keyOf(r), r]),
    );
    const wanted = new Set(EVENTS.map(keyOf));

    for (const e of EVENTS) {
      const row = existing.get(keyOf(e));
      if (!row) {
        tx.insert(academicEvents)
          .values({ ...e, source: 'seed' })
          .run();
        report.events++;
      } else if (
        row.source === 'seed' &&
        !row.lockedByUser &&
        (row.endDate !== e.endDate ||
          row.status !== e.status ||
          row.blocksClasses !== e.blocksClasses)
      ) {
        tx.update(academicEvents)
          .set({
            endDate: e.endDate,
            status: e.status,
            blocksClasses: e.blocksClasses,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(academicEvents.id, row.id))
          .run();
        report.eventsUpdated++;
      }
    }
    for (const [key, row] of existing) {
      if (!wanted.has(key) && row.source === 'seed' && !row.lockedByUser) {
        tx.delete(academicEvents).where(eq(academicEvents.id, row.id)).run();
        report.eventsRemoved++;
      }
    }

    // Emploi du temps S1 : créé une seule fois avec ses cases.
    const created = tx
      .insert(timetables)
      .values({
        label: TIMETABLE_S1.label,
        validFrom: TIMETABLE_S1.validFrom,
        validTo: TIMETABLE_S1.validTo,
      })
      .onConflictDoNothing()
      .returning({ id: timetables.id })
      .get();
    if (created) {
      const subjectIds = new Map(
        tx
          .select()
          .from(subjects)
          .all()
          .map((s) => [s.code, s.id]),
      );
      for (const slot of TIMETABLE_S1.slots) {
        const subjectId = subjectIds.get(slot.subjectCode);
        if (!subjectId) throw new Error(`Matière ${slot.subjectCode} introuvable`);
        const { subjectCode, ...rest } = slot;
        report.slots += tx
          .insert(timetableSlots)
          .values({ ...rest, timetableId: created.id, subjectId })
          .run().changes;
      }
    }
    return report;
  });
}

/** Vrai si la base contient déjà les données de départ. */
export function isSeeded(db: Db): boolean {
  return !!db.select().from(timetables).where(eq(timetables.label, TIMETABLE_S1.label)).get();
}
