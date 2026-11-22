import { describe, expect, it } from 'vitest';
import { estLaNuit, momentRappel, rappelDu, texteRappel } from './rappels';

// Africa/Tunis = UTC+1 toute l'année.
const tunis = (iso: string) => new Date(`${iso}+01:00`);

describe('rappels d’échéance', () => {
  it('2 jours avant, à la même heure', () => {
    expect(momentRappel(tunis('2026-11-26T08:00:00'), 48)).toEqual(tunis('2026-11-24T08:00:00'));
  });

  it('jamais la nuit : avancé à 21:00 la veille au soir', () => {
    // Échéance « jour entier » (23:59) → rappel le soir même à 21:00, deux jours avant.
    expect(momentRappel(tunis('2026-11-26T23:59:00'), 48)).toEqual(tunis('2026-11-24T21:00:00'));
    // Échéance à 06:00 → 06:00 deux jours avant est la nuit → la veille de ce jour à 21:00.
    expect(momentRappel(tunis('2026-11-26T06:00:00'), 48)).toEqual(tunis('2026-11-23T21:00:00'));
    expect(estLaNuit(tunis('2026-11-24T07:29:00'))).toBe(true);
    expect(estLaNuit(tunis('2026-11-24T07:30:00'))).toBe(false);
    expect(estLaNuit(tunis('2026-11-24T22:00:00'))).toBe(true);
  });

  it('envoi : moment atteint, échéance pas passée, pas la nuit', () => {
    const e = tunis('2026-11-26T08:00:00');
    expect(rappelDu(e, 48, tunis('2026-11-24T07:59:00'))).toBe(false);
    expect(rappelDu(e, 48, tunis('2026-11-24T08:00:00'))).toBe(true);
    // Tâche découverte tard (la veille) : rappel tout de suite…
    expect(rappelDu(e, 48, tunis('2026-11-25T15:00:00'))).toBe(true);
    // … sauf la nuit : il attendra 07:30.
    expect(rappelDu(e, 48, tunis('2026-11-25T23:00:00'))).toBe(false);
    expect(rappelDu(e, 48, tunis('2026-11-26T07:30:00'))).toBe(true);
    // Échéance passée : plus de rappel.
    expect(rappelDu(e, 48, tunis('2026-11-26T08:01:00'))).toBe(false);
  });

  it('texte : matière et quand, titre de la tâche en corps', () => {
    expect(
      texteRappel(
        {
          titre: 'Évaluation TP n°2',
          matiere: 'TNS',
          echeance: tunis('2026-11-26T08:00:00'),
          jourEntier: false,
        },
        tunis('2026-11-24T08:00:00'),
      ),
    ).toEqual({ titre: 'TNS · jeudi 08:00', corps: 'Évaluation TP n°2' });
    expect(
      texteRappel(
        { titre: 'Rendu', matiere: null, echeance: tunis('2026-11-25T23:59:00'), jourEntier: true },
        tunis('2026-11-24T21:00:00'),
      ).titre,
    ).toBe('À faire · demain');
  });
});
