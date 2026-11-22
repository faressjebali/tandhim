import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  addTunisDays,
  dayKeysBetween,
  dayOfWeek,
  daysBetween,
  formatDayKey,
  formatTunis,
  isDayKey,
  parseDayKey,
  startOfTunisDay,
  tunisDateTime,
  tunisDayKey,
  tunisInstantOn,
} from './time';

describe('fuseau Africa/Tunis', () => {
  it('convertit une heure murale de Tunis en UTC (UTC+1, été comme hiver)', () => {
    expect(tunisDateTime(2026, 9, 1, 8, 0).toISOString()).toBe('2026-09-01T07:00:00.000Z');
    expect(tunisDateTime(2027, 1, 11, 8, 0).toISOString()).toBe('2027-01-11T07:00:00.000Z');
    // Pas d'heure d'été en Tunisie : juillet reste UTC+1.
    expect(tunisDateTime(2027, 7, 3, 12, 0).toISOString()).toBe('2027-07-03T11:00:00.000Z');
  });

  it('formate en français à l’heure de Tunis', () => {
    const d = new Date('2026-11-23T23:30:00Z'); // 00:30 le 24/11 à Tunis
    expect(formatTunis(d, 'EEEE d MMMM HH:mm')).toBe('mardi 24 novembre 00:30');
  });

  it('calcule le début de journée à Tunis, pas en UTC', () => {
    const d = new Date('2026-11-23T23:30:00Z');
    expect(startOfTunisDay(d).toISOString()).toBe('2026-11-23T23:00:00.000Z');
    expect(tunisDayKey(d)).toBe('2026-11-24');
  });

  it('ajoute des jours calendaires', () => {
    const d = tunisDateTime(2026, 12, 31, 9, 45);
    expect(tunisDayKey(addTunisDays(d, 1))).toBe('2027-01-01');
  });
});

describe('jours calendaires (DayKey)', () => {
  it('valide le format et les dates impossibles', () => {
    expect(isDayKey('2026-11-20')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('20/11/2026')).toBe(false);
    expect(() => parseDayKey('2026-13-01')).toThrow(/Jour invalide/);
  });

  it('jour de la semaine ISO (1 = lundi, 7 = dimanche)', () => {
    expect(dayOfWeek('2026-11-23')).toBe(1);
    expect(dayOfWeek('2026-11-29')).toBe(7);
  });

  it('ajoute des jours en traversant mois et années', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2027-03-01', -1)).toBe('2027-02-28');
    expect(daysBetween('2026-11-23', '2026-12-03')).toBe(10);
    expect(dayKeysBetween('2026-11-28', '2026-12-01')).toEqual([
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
    ]);
  });

  it('instant UTC d’une heure de Tunis un jour donné', () => {
    expect(tunisInstantOn('2026-11-23', '09:45').toISOString()).toBe('2026-11-23T08:45:00.000Z');
  });

  it('formate un jour en français', () => {
    expect(formatDayKey('2026-12-03', 'EEEE d MMMM')).toBe('jeudi 3 décembre');
  });
});
