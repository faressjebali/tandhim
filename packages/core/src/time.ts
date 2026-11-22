/**
 * Toute la logique de date de l'app passe par ce module (règle du projet).
 * Stockage : instants UTC. Affichage / calculs calendaires : Africa/Tunis.
 */
import { TZDate, tz } from '@date-fns/tz';
import { format, startOfDay, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';

export const APP_TIME_ZONE = 'Africa/Tunis';
const inTunis = tz(APP_TIME_ZONE);

/** Représente un instant dans le fuseau Africa/Tunis. */
export function toTunis(date: Date | number | string): TZDate {
  return new TZDate(new Date(date).getTime(), APP_TIME_ZONE);
}

/** Construit un instant à partir d'une date/heure « murale » à Tunis (mois 1–12). */
export function tunisDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(new TZDate(year, month - 1, day, hour, minute, APP_TIME_ZONE).getTime());
}

/** Formate un instant en heure de Tunis, en français. */
export function formatTunis(date: Date | number, pattern: string): string {
  return format(date, pattern, { in: inTunis, locale: fr });
}

/** Minuit (heure de Tunis) du jour contenant `date`, renvoyé en instant UTC. */
export function startOfTunisDay(date: Date | number): Date {
  return new Date(startOfDay(date, { in: inTunis }).getTime());
}

/** Ajoute des jours calendaires à Tunis. */
export function addTunisDays(date: Date | number, days: number): Date {
  return new Date(addDays(date, days, { in: inTunis }).getTime());
}

/** Clé de jour « AAAA-MM-JJ » à Tunis (utile pour grouper / comparer des jours). */
export function tunisDayKey(date: Date | number): DayKey {
  return formatTunis(date, 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------
// Jours calendaires (« DayKey ») : un jour à Tunis, sans heure, au format AAAA-MM-JJ.
// C'est le format stocké en base pour tout ce qui est « un jour » (semaines,
// vacances, fériés…). Les calculs se font en UTC pur, donc sans effet de fuseau.
// ---------------------------------------------------------------------------

export type DayKey = string;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isDayKey(value: string): value is DayKey {
  const m = DAY_KEY.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function parseDayKey(key: DayKey): { year: number; month: number; day: number } {
  if (!isDayKey(key)) throw new Error(`Jour invalide : « ${key} » (attendu AAAA-MM-JJ)`);
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

function dayKeyToUtcMs(key: DayKey): number {
  const { year, month, day } = parseDayKey(key);
  return Date.UTC(year, month - 1, day);
}

function utcMsToDayKey(ms: number): DayKey {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function dayOfWeek(key: DayKey): number {
  const d = new Date(dayKeyToUtcMs(key)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function addDaysToKey(key: DayKey, days: number): DayKey {
  return utcMsToDayKey(dayKeyToUtcMs(key) + days * MS_PER_DAY);
}

/** Nombre de jours de `from` à `to` (négatif si `to` est avant). */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((dayKeyToUtcMs(to) - dayKeyToUtcMs(from)) / MS_PER_DAY);
}

/** Tous les jours de `from` à `to` inclus. */
export function dayKeysBetween(from: DayKey, to: DayKey): DayKey[] {
  const n = daysBetween(from, to);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDaysToKey(from, i));
}

/** Instant UTC correspondant à `HH:MM` (heure de Tunis) le jour `key`. */
export function tunisInstantOn(key: DayKey, hhmm: string): Date {
  const { year, month, day } = parseDayKey(key);
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return tunisDateTime(year, month, day, h, m);
}

/** Formate un jour (sans heure) en français, ex. « lundi 23 novembre ». */
export function formatDayKey(key: DayKey, pattern: string): string {
  return formatTunis(tunisInstantOn(key, '12:00'), pattern);
}
