import { describe, expect, it } from 'vitest';
import {
  JOURS_DARIJA,
  lundiSemaineJeya,
  resoudreJour,
  resoudreJourDetaille,
} from './dates-relatives';

const jeudi = JOURS_DARIJA.lkhmis!;
const vendredi = JOURS_DARIJA.ljom3a!;

describe('« <jour> hedha » / « <jour> jey » (règle de Fares du 21/11/2026)', () => {
  it('écrit le samedi 21/11 : hedha = 26/11, jey = 03/12', () => {
    expect(resoudreJour('2026-11-21', jeudi, 'hedha')).toBe('2026-11-26');
    expect(resoudreJour('2026-11-21', jeudi, 'jey')).toBe('2026-12-03');
  });

  it('écrit le dimanche 22/11 et le lundi 23/11 : mêmes réponses', () => {
    for (const d of ['2026-11-22', '2026-11-23']) {
      expect(resoudreJour(d, jeudi, 'hedha')).toBe('2026-11-26');
      expect(resoudreJour(d, jeudi, 'jey')).toBe('2026-12-03');
    }
  });

  it('écrit le vendredi 27/11 (jeudi déjà passé) : « jey » = 03/12 sans ambiguïté', () => {
    expect(resoudreJour('2026-11-27', jeudi, 'hedha')).toBe('2026-12-03');
    expect(resoudreJour('2026-11-27', jeudi, 'jey')).toBe('2026-12-03');
  });

  it('jour passé + verbe au passé : le jour passé (« kenet lkhmis hedha »)', () => {
    expect(resoudreJour('2026-11-27', jeudi, 'hedha', true)).toBe('2026-11-26');
    // « jey » ne regarde jamais en arrière.
    expect(resoudreJour('2026-11-27', jeudi, 'jey', true)).toBe('2026-12-03');
  });

  it('lundi 23 : « vendredi hedha » = 27, « vendredi jey » = 04 (« mouch hedha, ljey »)', () => {
    expect(resoudreJourDetaille('2026-11-23', vendredi, 'hedha')).toEqual({
      jour: '2026-11-27',
      ambigu: false,
    });
    expect(resoudreJourDetaille('2026-11-23', vendredi, 'jey')).toEqual({
      jour: '2026-12-04',
      ambigu: false,
    });
  });

  it('dimanche 22 : début de semaine — « vendredi hedha » = 27, « jey » = 04', () => {
    expect(resoudreJourDetaille('2026-11-22', vendredi, 'hedha')).toEqual({
      jour: '2026-11-27',
      ambigu: false,
    });
    expect(resoudreJourDetaille('2026-11-22', vendredi, 'jey')).toEqual({
      jour: '2026-12-04',
      ambigu: false,
    });
  });

  it('samedi 21 + « vendredi » : ambigu, le plus proche (27) par défaut', () => {
    expect(resoudreJourDetaille('2026-11-21', vendredi, 'jey')).toEqual({
      jour: '2026-11-27',
      ambigu: true,
    });
    expect(resoudreJourDetaille('2026-11-21', vendredi, 'hedha')).toEqual({
      jour: '2026-11-27',
      ambigu: true,
    });
    // Les autres jours, dits le samedi, ne sont pas ambigus.
    expect(resoudreJourDetaille('2026-11-21', jeudi, 'jey').ambigu).toBe(false);
  });

  it('écrit un jeudi : « hedha » = le jour même (confirmé par Fares), « jey » = +7', () => {
    expect(resoudreJour('2026-11-26', jeudi, 'hedha')).toBe('2026-11-26');
    expect(resoudreJour('2026-11-26', jeudi, 'jey')).toBe('2026-12-03');
  });

  it('traverse les mois et les années', () => {
    // Mercredi 30/12 : lundi déjà passé → « jey » = le prochain lundi.
    expect(resoudreJour('2026-12-30', JOURS_DARIJA.ltnin!, 'jey')).toBe('2027-01-04');
    expect(resoudreJour('2026-12-30', JOURS_DARIJA.l7ad!, 'jey')).toBe('2027-01-10');
  });

  it('reconnaît plusieurs graphies des jours', () => {
    expect(JOURS_DARIJA.ljom3a).toBe(5);
    expect(JOURS_DARIJA.sebt).toBe(6);
    expect(JOURS_DARIJA.l7ad).toBe(7);
    expect(() => resoudreJour('2026-11-21', 8, 'jey')).toThrow();
  });
});

describe('« el semaine jeya » = la semaine suivante', () => {
  it('lundi de la semaine qui suit celle du message', () => {
    expect(lundiSemaineJeya('2026-11-21')).toBe('2026-11-23'); // samedi → lundi 23
    expect(lundiSemaineJeya('2026-11-23')).toBe('2026-11-30'); // lundi → lundi suivant
    expect(lundiSemaineJeya('2026-11-29')).toBe('2026-11-30'); // dimanche → lendemain
  });
});
