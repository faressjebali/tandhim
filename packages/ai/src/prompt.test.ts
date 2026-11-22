import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LEXIQUE, construirePrompt } from './prompt';
import { analyseSchema } from './schema';

describe('prompt d’analyse', () => {
  it('contient le contexte, les tâches connues, le lexique et chaque élément', () => {
    const p = construirePrompt({
      aujourdhui: 'samedi 21 novembre 2026',
      semaine: 'Sem.12 (a)',
      matieres: [
        {
          code: 'TNS',
          nom: 'Traitement numérique du signal',
          enseignant: 'Mme Ferchichi',
          alias: ['TNS'],
        },
      ],
      taches: [{ numero: 7, titre: 'Compte rendu TP3', matiere: 'TNS', echeance: '3 déc.' }],
      sources: [
        {
          id: 1,
          type: 'mail reçu',
          date: 'lundi 23 novembre 2026 à 19:00',
          de: 'prof@exemple.tn',
          a: null,
          titre: 'TP3',
          texte: 'x'.repeat(5000),
          pieces: ['enonce.pdf'],
          matiereConnue: null,
        },
      ],
    });
    expect(p).toContain('TNS : Traitement numérique du signal (Mme Ferchichi)');
    expect(p).toContain('n°7 : Compte rendu TP3 [TNS], pour le 3 déc.');
    expect(p).toContain('### Élément 1');
    expect(p).toContain('Pièces jointes : enonce.pdf');
    expect(p).toContain('lkhmis');
    expect(p).not.toContain('x'.repeat(4001)); // texte tronqué
    expect(LEXIQUE).toContain('« <jour> jey »');
  });

  it('le schéma JSON envoyé à Gemini est généré sans erreur', () => {
    const schema = z.toJSONSchema(analyseSchema) as { properties?: Record<string, unknown> };
    expect(schema.properties).toHaveProperty('resultats');
  });
});
