import type { AcademicEvent, AcademicWeek, CalendarData, Timetable } from '@tandhim/core';
import { eq, isNull } from 'drizzle-orm';
import type { Db } from './client';
import {
  academicEvents,
  academicWeeks,
  semesters,
  subjects,
  timetableSlots,
  timetables,
} from './schema';

/** Tout ce qu'il faut pour calculer semaines a/b et séances (cf. @tandhim/core calendar). */
export function loadCalendarData(db: Db): CalendarData {
  const weeks: AcademicWeek[] = db
    .select({
      semester: semesters.number,
      number: academicWeeks.number,
      letter: academicWeeks.letter,
      startDate: academicWeeks.startDate,
    })
    .from(academicWeeks)
    .innerJoin(semesters, eq(academicWeeks.semesterId, semesters.id))
    .orderBy(academicWeeks.startDate)
    .all()
    .map((w) => ({ ...w, semester: w.semester as 1 | 2 }));

  const events: AcademicEvent[] = db
    .select({
      kind: academicEvents.kind,
      title: academicEvents.title,
      startDate: academicEvents.startDate,
      endDate: academicEvents.endDate,
      status: academicEvents.status,
      blocksClasses: academicEvents.blocksClasses,
    })
    .from(academicEvents)
    .orderBy(academicEvents.startDate)
    .all();

  const rows = db
    .select({
      timetableId: timetables.id,
      label: timetables.label,
      validFrom: timetables.validFrom,
      validTo: timetables.validTo,
      dayOfWeek: timetableSlots.dayOfWeek,
      slot: timetableSlots.slot,
      subjectCode: subjects.code,
      type: timetableSlots.type,
      room: timetableSlots.room,
      teacher: timetableSlots.teacher,
      weeks: timetableSlots.weeks,
    })
    .from(timetables)
    .innerJoin(timetableSlots, eq(timetableSlots.timetableId, timetables.id))
    .innerJoin(subjects, eq(timetableSlots.subjectId, subjects.id))
    .where(isNull(timetables.archivedAt))
    .all();

  const byId = new Map<number, Timetable>();
  for (const r of rows) {
    const t =
      byId.get(r.timetableId) ??
      byId
        .set(r.timetableId, {
          label: r.label,
          validFrom: r.validFrom,
          validTo: r.validTo,
          slots: [],
        })
        .get(r.timetableId)!;
    t.slots.push({
      dayOfWeek: r.dayOfWeek,
      slot: r.slot,
      subjectCode: r.subjectCode,
      type: r.type,
      room: r.room,
      teacher: r.teacher,
      weeks: r.weeks,
    });
  }
  return { weeks, events, timetables: [...byId.values()] };
}

export type SubjectRow = typeof subjects.$inferSelect;

/** Matières dans l'ordre de l'emploi du temps (code → ligne). */
export function listSubjects(db: Db): SubjectRow[] {
  return db.select().from(subjects).orderBy(subjects.id).all();
}
