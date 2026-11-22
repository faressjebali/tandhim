import { describe, expect, it } from 'vitest';
import {
  type CalendarData,
  dayOfWeek,
  eventsOn,
  isDayKey,
  sessionsBetween,
  sessionsOn,
  weekLabel,
  weekOf,
} from '@tandhim/core';
import { EVENTS, SUBJECTS, TIMETABLE_S1, WEEKS } from './data';

const data: CalendarData = { weeks: WEEKS, events: EVENTS, timetables: [TIMETABLE_S1] };
const codes = (date: string) =>
  sessionsOn(date, data).map((s) => `${s.slot} ${s.subjectCode} ${s.type}`);

describe('données de départ : cohérence', () => {
  it('chaque semaine commence un lundi et les dates sont valides', () => {
    for (const w of WEEKS) {
      expect(isDayKey(w.startDate), w.startDate).toBe(true);
      expect(dayOfWeek(w.startDate), `Sem.${w.number} S${w.semester}`).toBe(1);
    }
  });

  it('semaines consécutives espacées de 7 jours, sauf autour des DS / vacances', () => {
    const s1 = WEEKS.filter((w) => w.semester === 1).map((w) => w.number);
    expect(s1).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15]);
  });

  it('lettres a/b conformes au calendrier pédagogique', () => {
    const letters = (sem: 1 | 2) =>
      WEEKS.filter((w) => w.semester === sem)
        .map((w) => `${w.number}${w.letter}`)
        .join(' ');
    expect(letters(1)).toBe('1a 2b 3a 4b 5a 6b 7a 8b 9a 11b 12a 13b 14a 15b');
    expect(letters(2)).toBe('1a 2b 3a 4b 5a 6b 7a 8b 9a 11b 12a 13b 14a 15b');
  });

  it('événements : dates valides, fin ≥ début', () => {
    for (const e of EVENTS) {
      expect(isDayKey(e.startDate) && isDayKey(e.endDate), e.title).toBe(true);
      expect(e.endDate >= e.startDate, e.title).toBe(true);
    }
  });

  it('aucune semaine de cours ne chevauche une période de DS, de vacances ou d’examens', () => {
    for (const e of EVENTS.filter((x) => ['ds', 'vacances', 'examens'].includes(x.kind))) {
      expect(weekOf(e.startDate, WEEKS), e.title).toBeUndefined();
      expect(weekOf(e.endDate, WEEKS), e.title).toBeUndefined();
    }
  });

  it('chaque case de l’emploi du temps renvoie à une matière connue', () => {
    const known = new Set(SUBJECTS.map((s) => s.code));
    for (const s of TIMETABLE_S1.slots) expect(known.has(s.subjectCode), s.subjectCode).toBe(true);
    expect(TIMETABLE_S1.slots).toHaveLength(17);
  });
});

describe('étiquette de semaine', () => {
  it('affiche « Sem.N (lettre) » en semaine de cours', () => {
    expect(weekLabel('2026-11-20', data)).toBe('Sem.12 (a)');
    expect(weekLabel('2026-11-23', data)).toBe('Sem.13 (b)');
    expect(weekLabel('2026-11-29', data)).toBe('Sem.13 (b)'); // dimanche
  });

  it('affiche le nom de la période hors semaines de cours', () => {
    expect(weekLabel('2026-11-03', data)).toBe('DS semestre 1');
    expect(weekLabel('2026-12-20', data)).toBe("Vacances d'hiver");
    expect(weekLabel('2027-01-05', data)).toBe('Examens S1');
  });
});

describe('séances réelles (semaines a/b, fériés, périodes bloquées)', () => {
  it('pas de cours le lundi 31/08 : l’emploi du temps commence le mardi 01/09', () => {
    expect(codes('2026-08-31')).toEqual([]);
    expect(codes('2026-09-01')).toEqual(['C2 THD CI', 'C3 GF C']);
  });

  it('lundi : TP de PRM seulement en semaine (b)', () => {
    expect(codes('2026-09-07')).toEqual(['C2 STR C', 'C4 PRM TP']); // Sem.2 (b)
    expect(codes('2026-09-14')).toEqual(['C2 STR C']); // Sem.3 (a)
  });

  it('mercredi : TP de PU seulement en semaine (a)', () => {
    expect(codes('2026-09-16')).toEqual(['C1 PU C', 'C2 PU TP', 'C3 PRM C']); // (a)
    expect(codes('2026-09-09')).toEqual(['C1 PU C', 'C3 PRM C']); // (b)
  });

  it('jeudi : TP de ML seulement en semaine (b)', () => {
    expect(codes('2026-11-19')).toEqual(['C1 TNS TP', 'C2 ANG TD', 'C3 COM C', 'C4 ML C']); // Sem.12 (a)
    expect(codes('2026-11-26')).toEqual([
      'C1 TNS TP',
      'C2 ANG TD',
      'C3 COM C',
      'C4 ML C',
      'C5 ML TP',
    ]); // Sem.13 (b)
  });

  it('vendredi : TP de Frameworks seulement en semaine (a)', () => {
    expect(codes('2026-11-20')).toEqual([
      'C1 TNS C',
      'C2 RHD C',
      'C3 DROIT C',
      'C4 FW C',
      'C5 FW TP',
    ]); // (a)
    expect(codes('2026-12-11')).toEqual(['C1 TNS C', 'C2 RHD C', 'C3 DROIT C', 'C4 FW C']); // Sem.15 (b)
  });

  it('aucune séance pendant DS, vacances, examens, jours fériés, samedi et dimanche', () => {
    expect(codes('2026-10-15')).toEqual([]); // jeudi férié
    expect(sessionsBetween('2026-11-02', '2026-11-07', data)).toEqual([]); // DS
    expect(sessionsBetween('2026-12-14', '2027-01-09', data)).toEqual([]); // vacances + examens
    expect(codes('2026-11-21')).toEqual([]); // samedi
    expect(codes('2026-11-22')).toEqual([]); // dimanche
  });

  it('rien après la fin de validité de l’emploi du temps S1 (le S2 viendra par import)', () => {
    expect(sessionsBetween('2026-12-13', '2027-05-08', data)).toEqual([]);
  });

  it('horaires convertis en UTC depuis l’heure de Tunis', () => {
    const [first, ...rest] = sessionsOn('2026-11-19', data);
    expect(first?.start.toISOString()).toBe('2026-11-19T07:00:00.000Z'); // 08:00 à Tunis
    expect(first?.end.toISOString()).toBe('2026-11-19T08:30:00.000Z');
    expect(rest.at(-1)?.end.toISOString()).toBe('2026-11-19T14:30:00.000Z'); // C4 finit à 15:30
  });

  it('nombre total de séances du S1 (contrôle global)', () => {
    // 13 semaines de cours pleines (Sem.2 → 15 hors DS) + Sem.1 sans le lundi, moins le jeudi férié.
    const total = sessionsBetween('2026-08-31', '2026-12-12', data).length;
    // Par semaine : 13 cases « toutes semaines » + 2 cases (b) [PRM TP, ML TP] ou 2 cases (a) [PU TP, FW TP].
    // Sem.1 (a) sans lundi : 15 − 1 (STR lundi) = 14. Sem.7 (a) avec jeudi férié : 15 − 4 = 11.
    // Semaines 2–6, 8, 9, 11–15 : 12 semaines × 15 = 180. Total = 14 + 11 + 180 = 205.
    expect(total).toBe(205);
  });
});

describe('dates confirmées par Fares (20/11/2026)', () => {
  const on = (d: string) => eventsOn(d, EVENTS).map((e) => e.title);
  it('examens S2 en trois blocs, sans le dimanche 23/05 ni les 16–19/05', () => {
    expect(on('2027-05-13')).toContain('Examens S2');
    expect(on('2027-05-16')).not.toContain('Examens S2');
    expect(on('2027-05-19')).not.toContain('Examens S2');
    expect(on('2027-05-22')).toContain('Examens S2');
    expect(on('2027-05-23')).not.toContain('Examens S2');
    expect(on('2027-05-26')).toContain('Examens S2');
    expect(on('2027-05-27')).not.toContain('Examens S2');
  });

  it('session de contrôle du 14 au 23/06, sauf le dimanche 20', () => {
    expect(dayOfWeek('2027-06-20')).toBe(7);
    expect(on('2027-06-19')).toContain('Session de contrôle');
    expect(on('2027-06-20')).not.toContain('Session de contrôle');
    expect(on('2027-06-23')).toContain('Session de contrôle');
    expect(on('2027-06-24')).not.toContain('Session de contrôle');
  });

  it('validation S1 jusqu’au 12/02, fériés lunaires dont le 07/06 (à confirmer)', () => {
    expect(on('2027-02-12')).toContain('Validation des notes S1');
    const lunaires = EVENTS.filter((e) => e.kind === 'ferie_lunaire');
    expect(lunaires.map((e) => e.startDate)).toEqual(['2027-03-09', '2027-05-17', '2027-06-07']);
    expect(lunaires.every((e) => e.status === 'a_confirmer')).toBe(true);
    expect(
      EVENTS.filter((e) => e.kind !== 'ferie_lunaire').every((e) => e.status === 'confirme'),
    ).toBe(true);
  });
});
