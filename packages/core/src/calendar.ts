/**
 * Calendrier pédagogique, semaines a/b et séances de l'emploi du temps (SPEC §6.4).
 * Logique pure : reçoit les données (semaines, événements, emplois du temps) en entrée.
 */
import {
  type DayKey,
  addDaysToKey,
  dayKeysBetween,
  dayOfWeek,
  tunisDayKey,
  tunisInstantOn,
} from './time';

export type WeekLetter = 'a' | 'b';
export type SlotCode = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
export type SessionType = 'C' | 'TD' | 'TP' | 'CI';
/** Semaines où une case a lieu : toutes, ou seulement les semaines (a) / (b). */
export type SlotWeeks = 'all' | 'A' | 'B';

export const SLOT_TIMES: Record<SlotCode, { start: string; end: string }> = {
  C1: { start: '08:00', end: '09:30' },
  C2: { start: '09:45', end: '11:15' },
  C3: { start: '11:30', end: '13:00' },
  C4: { start: '14:00', end: '15:30' },
  C5: { start: '15:45', end: '17:15' },
};

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  C: 'Cours',
  TD: 'TD',
  TP: 'TP',
  CI: 'Cours intégré',
};

export interface AcademicWeek {
  semester: 1 | 2;
  number: number;
  letter: WeekLetter;
  /** Lundi de la semaine. */
  startDate: DayKey;
}

export type AcademicEventKind =
  | 'ds'
  | 'examens'
  | 'vacances'
  | 'ferie'
  | 'ferie_lunaire'
  | 'arret_cours'
  | 'controle'
  | 'deliberation'
  | 'validation_notes'
  | 'fete';

export interface AcademicEvent {
  kind: AcademicEventKind;
  title: string;
  startDate: DayKey;
  /** Inclus. */
  endDate: DayKey;
  status: 'confirme' | 'a_confirmer';
  /** Pas de séance normale ces jours-là (DS, examens, vacances, fériés…). */
  blocksClasses: boolean;
}

export interface TimetableSlot {
  /** 1 = lundi … 6 = samedi. */
  dayOfWeek: number;
  slot: SlotCode;
  subjectCode: string;
  type: SessionType;
  room: string;
  teacher: string;
  weeks: SlotWeeks;
}

export interface Timetable {
  label: string;
  validFrom: DayKey;
  /** Inclus. */
  validTo: DayKey;
  slots: TimetableSlot[];
}

export interface CalendarData {
  weeks: AcademicWeek[];
  events: AcademicEvent[];
  timetables: Timetable[];
}

export interface Session extends TimetableSlot {
  date: DayKey;
  start: Date;
  end: Date;
  week: AcademicWeek;
}

/** Semaine pédagogique contenant ce jour (aucune pendant DS, vacances, examens…). */
export function weekOf(date: DayKey, weeks: AcademicWeek[]): AcademicWeek | undefined {
  return weeks.find((w) => date >= w.startDate && date <= addDaysToKey(w.startDate, 6));
}

/** Événements du calendrier qui couvrent ce jour. */
export function eventsOn(date: DayKey, events: AcademicEvent[]): AcademicEvent[] {
  return events.filter((e) => date >= e.startDate && date <= e.endDate);
}

/** Étiquette affichée, ex. « Sem.13 (b) », ou le nom de la période (« DS », « Vacances… »). */
export function weekLabel(date: DayKey, data: Pick<CalendarData, 'weeks' | 'events'>): string {
  const week = weekOf(date, data.weeks);
  if (week) return `Sem.${week.number} (${week.letter})`;
  const period = eventsOn(date, data.events).find((e) =>
    ['ds', 'examens', 'vacances', 'controle'].includes(e.kind),
  );
  return period?.title ?? 'Hors semaines de cours';
}

function slotMatchesWeek(weeks: SlotWeeks, letter: WeekLetter): boolean {
  return weeks === 'all' || weeks.toLowerCase() === letter;
}

/** Emploi du temps en vigueur ce jour-là (le plus récent si plusieurs se chevauchent). */
export function timetableOn(date: DayKey, timetables: Timetable[]): Timetable | undefined {
  return timetables
    .filter((t) => date >= t.validFrom && date <= t.validTo)
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
}

/** Séances qui ont réellement lieu ce jour-là, triées par heure. */
export function sessionsOn(date: DayKey, data: CalendarData): Session[] {
  const week = weekOf(date, data.weeks);
  if (!week) return [];
  if (eventsOn(date, data.events).some((e) => e.blocksClasses)) return [];
  const timetable = timetableOn(date, data.timetables);
  if (!timetable) return [];
  const dow = dayOfWeek(date);
  return timetable.slots
    .filter((s) => s.dayOfWeek === dow && slotMatchesWeek(s.weeks, week.letter))
    .sort((a, b) => (a.slot < b.slot ? -1 : 1))
    .map((s) => ({
      ...s,
      date,
      week,
      start: tunisInstantOn(date, SLOT_TIMES[s.slot].start),
      end: tunisInstantOn(date, SLOT_TIMES[s.slot].end),
    }));
}

/** Séances de `from` à `to` inclus. */
export function sessionsBetween(from: DayKey, to: DayKey, data: CalendarData): Session[] {
  return dayKeysBetween(from, to).flatMap((d) => sessionsOn(d, data));
}

/** Première séance de la matière qui commence après `apres` (dans la limite de `horizonJours`). */
export function prochaineSeance(
  matiere: string,
  apres: Date,
  data: CalendarData,
  horizonJours = 21,
): Session | undefined {
  const jour = tunisDayKey(apres);
  return sessionsBetween(jour, addDaysToKey(jour, horizonJours), data).find(
    (s) => s.subjectCode === matiere && s.start > apres,
  );
}
