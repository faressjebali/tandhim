import { describe, expect, it } from 'vitest';
import type { CalendarData } from './calendar';
import { creneauxLibres, planifierRevisions } from './revisions';
import { formatTunis } from './time';

// Une semaine de cours (lundi 7/12) puis les vacances : cours le lundi en C1 seulement.
const data: CalendarData = {
  weeks: [{ semester: 1, number: 15, letter: 'b', startDate: '2026-12-07' }],
  events: [],
  timetables: [
    {
      label: 'S1',
      validFrom: '2026-09-01',
      validTo: '2026-12-12',
      slots: [
        {
          dayOfWeek: 1,
          slot: 'C1',
          subjectCode: 'TNS',
          type: 'C',
          room: 'A2',
          teacher: 'X',
          weeks: 'all',
        },
      ],
    },
  ],
};
const tunis = (iso: string) => new Date(`${iso}+01:00`);
const f = (d: Date) => formatTunis(d, 'EEE dd/MM HH:mm');

describe('créneaux libres', () => {
  it('jour de cours : le soir ; jour libre : matin, après-midi, fin d’après-midi', () => {
    expect(creneauxLibres('2026-12-07', data, [], 120).map((c) => f(c.debut))).toEqual([
      'lun. 07/12 18:00',
    ]);
    expect(creneauxLibres('2026-12-08', data, [], 120).map((c) => f(c.debut))).toEqual([
      'mar. 08/12 09:00',
      'mar. 08/12 14:00',
      'mar. 08/12 16:30',
    ]);
  });

  it('une épreuve occupe son créneau', () => {
    const ds = { id: 9, matiere: 'ML', titre: 'DS ML', debut: tunis('2026-12-08T14:00:00') };
    expect(creneauxLibres('2026-12-08', data, [ds], 120).map((c) => f(c.debut))).toEqual([
      'mar. 08/12 09:00',
    ]);
  });
});

describe('planning de révision', () => {
  const ml = { id: 1, matiere: 'ML', titre: 'Examen ML', debut: tunis('2026-12-28T09:00:00') };
  const tns = { id: 2, matiere: 'TNS', titre: 'Examen TNS', debut: tunis('2026-12-30T09:00:00') };
  const lundi = tunis('2026-12-14T08:00:00');

  it('4 séances par épreuve, étalées, la dernière la veille, jamais deux au même moment', () => {
    const p = planifierRevisions([ml, tns], data, '2026-12-14', lundi);
    const deML = p.filter((s) => s.epreuveId === 1).map((s) => f(s.debut));
    const deTNS = p.filter((s) => s.epreuveId === 2).map((s) => f(s.debut));
    expect(deML).toHaveLength(4);
    expect(deTNS).toHaveLength(4);
    expect(deML.at(-1)).toBe('dim. 27/12 16:30');
    expect(deTNS.at(-1)).toBe('mar. 29/12 16:30');
    // Fenêtre de 10 jours : pas avant le 18/12 pour l'examen du 28/12.
    const premiereML = p.find((s) => s.epreuveId === 1)!.debut;
    expect(premiereML >= tunis('2026-12-18T00:00:00')).toBe(true);
    const debuts = p.map((s) => s.debut.getTime());
    expect(new Set(debuts).size).toBe(debuts.length);
  });

  it('jamais dans le passé ; séances déjà faites comptées', () => {
    const tard = tunis('2026-12-27T15:00:00');
    expect(planifierRevisions([ml], data, '2026-12-27', tard).map((s) => f(s.debut))).toEqual([
      'dim. 27/12 16:30',
    ]);
    const faites = new Map([[1, 3]]);
    expect(planifierRevisions([ml], data, '2026-12-14', lundi, undefined, faites)).toHaveLength(1);
  });

  it('épreuve passée : rien', () => {
    expect(planifierRevisions([ml], data, '2026-12-29', tunis('2026-12-29T10:00:00'))).toEqual([]);
  });
});
