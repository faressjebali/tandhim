import { describe, expect, it } from 'vitest';
import { type MatiereSaisie, analyserSaisie } from './saisie';

const matieres: MatiereSaisie[] = [
  { id: 1, code: 'ML', nom: 'Machine Learning', alias: ['apprentissage automatique'] },
  { id: 2, code: 'TNS', nom: 'Traitement numérique du signal', alias: ['traitement du signal'] },
  { id: 3, code: 'PRM', nom: 'Protocoles de réseaux mobiles', alias: [] },
  { id: 4, code: 'FW', nom: 'Frameworks', alias: ['angular'] },
];
// Samedi 21/11/2026.
const samedi = '2026-11-21';
const a = (t: string, jour = samedi) => analyserSaisie(t, jour, matieres);

describe('ajout rapide en langage naturel', () => {
  it('« TP ML vendredi 14h »', () => {
    expect(a('TP ML vendredi 14h')).toEqual({
      jour: '2026-11-27',
      heure: '14:00',
      matiereId: 1,
      importance: null,
    });
  });

  it('demain, après-demain, darija', () => {
    expect(a('CR TNS demain').jour).toBe('2026-11-22');
    expect(a('rendu après-demain').jour).toBe('2026-11-23');
    expect(a('TP ghodwa 9h30')).toMatchObject({ jour: '2026-11-22', heure: '09:30' });
    expect(a('validation lkhmis jey').jour).toBe('2026-12-03');
    expect(a('validation lkhmis').jour).toBe('2026-11-26');
    expect(a('réunion vendredi prochain').jour).toBe('2026-11-27');
  });

  it('dates écrites (année scolaire 2026/2027)', () => {
    expect(a('rendu PRM le 3/12').jour).toBe('2026-12-03');
    expect(a('DS le 12 janvier').jour).toBe('2027-01-12');
    expect(a('rapport 15-02').jour).toBe('2027-02-15');
    // « le 3 » écrit le 21 novembre → 3 décembre.
    expect(a('soutenance le 3').jour).toBe('2026-12-03');
    expect(a('soutenance le 25').jour).toBe('2026-11-25');
  });

  it('heures', () => {
    expect(a('TP à 8h').heure).toBe('08:00');
    expect(a('TP 15:45').heure).toBe('15:45');
    expect(a('TP 14h30').heure).toBe('14:30');
    expect(a('TP3 ML').heure).toBeNull();
  });

  it('matière : code, alias ou nom ; pas de faux positif dans un mot', () => {
    expect(a('TP angular').matiereId).toBe(4);
    expect(a('exos traitement du signal').matiereId).toBe(2);
    expect(a('html et xml').matiereId).toBeNull();
    expect(a('acheter du pain').matiereId).toBeNull();
  });

  it('importance haute si « urgent » ou « ! »', () => {
    expect(a('CR PRM urgent').importance).toBe('haute');
    expect(a('CR PRM !').importance).toBe('haute');
    expect(a('CR PRM').importance).toBeNull();
  });
});
