import { describe, expect, it } from 'vitest';
import { echeanceClassroom, estRendu, rapprocherMatiere } from './classroom';

describe('échéance Classroom', () => {
  it('date et heure en UTC → instant', () => {
    const r = echeanceClassroom({ year: 2026, month: 12, day: 3 }, { hours: 7, minutes: 0 });
    expect(r).toEqual({ echeance: new Date('2026-12-03T07:00:00Z'), jourEntier: false });
  });

  it('« 23:59 heure de Tunis » = jour entier (22:59 UTC)', () => {
    const r = echeanceClassroom({ year: 2026, month: 12, day: 3 }, { hours: 22, minutes: 59 });
    expect(r?.jourEntier).toBe(true);
  });

  it('heure absente → minuit UTC ; pas de date → pas d’échéance', () => {
    expect(echeanceClassroom({ year: 2026, month: 1, day: 5 }, {})?.echeance.toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    );
    expect(echeanceClassroom(undefined, undefined)).toBeNull();
    expect(echeanceClassroom({ year: 2026 }, null)).toBeNull();
  });
});

describe('rendu', () => {
  it('rendu ou rendu-corrigé = terminé ; le reste non', () => {
    expect(estRendu('TURNED_IN')).toBe(true);
    expect(estRendu('RETURNED')).toBe(true);
    for (const e of ['NEW', 'CREATED', 'RECLAIMED_BY_STUDENT', null, undefined]) {
      expect(estRendu(e)).toBe(false);
    }
  });
});

describe('cours Classroom → matière', () => {
  const m = (id: number, code: string, name: string, aliases: string[] = []) => ({
    id,
    code,
    name,
    aliases,
  });
  const matieres = [
    m(1, 'STR', 'Systèmes temps réel', ['STR', 'temps réel']),
    m(2, 'PRM', 'Protocoles de réseaux mobiles', ['PRM', 'réseaux mobiles']),
    m(3, 'PU', 'Processus unifiés et approches agiles', ['PU', 'agile', 'agiles']),
    m(4, 'FW', 'Frameworks de développement', ['frameworks', 'framework', 'FW']),
    m(5, 'THD', 'Transmission haut débit', ['THD', 'transmission']),
    m(6, 'ML', 'Machine Learning', ['ML', 'machine learning']),
  ];
  const r = (nom: string) => rapprocherMatiere(nom, matieres)?.code ?? null;

  it('reconnaît les vrais noms de cours de Fares', () => {
    expect(r('STR-2026')).toBe('STR');
    expect(r('TP-STR-RT4')).toBe('STR');
    expect(r('Cours Framework RT4 26 27')).toBe('FW');
    expect(r('PU & approches Agiles 26-27')).toBe('PU');
    expect(r('Protocoles des réseaux mobiles 26-27')).toBe('PRM');
  });

  it('ne rapproche pas les cours sans rapport (années précédentes)', () => {
    expect(r('Algèbre linéaire')).toBeNull();
    expect(r('Réseaux Locaux Sans fil (2025--26)')).toBeNull();
    expect(r('Atelier C++')).toBeNull();
    // « ml » à l'intérieur d'un mot ne compte pas
    expect(r('HTML avancé')).toBeNull();
  });

  it('RT2025 (Transmission haut débit) n’est pas reconnaissable par son nom', () => {
    expect(r('RT2025')).toBeNull();
  });
});
