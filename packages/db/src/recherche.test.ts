import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DbHandle, applySeed, creerTache, openDb } from './index';
import { runMigrations } from './migrate';
import { rechercher } from './recherche';
import { sourceItems } from './schema';

let dir: string;
let h: DbHandle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-recherche-'));
  h = openDb(dir);
  runMigrations(h.db);
  applySeed(h.db);
  creerTache(h.db, { titre: 'Évaluation TP n°2 : DiffWave', description: 'compte rendu' });
  h.db
    .insert(sourceItems)
    .values({
      source: 'gmail',
      externalId: 'm1',
      sentAt: '2026-11-15T15:51:00Z',
      sender: 'LEILA FERCHICHI <leila.ferchichi@exemple.tn>',
      title: 'Validation TP pour 26-27/11',
      body: 'Ci-joint le sujet de l’évaluation de TP n°2 (modèle DiffWave).',
      link: 'https://mail.google.com/x',
      status: 'traite',
      pertinent: true,
      attachments: [
        { nom: 'Eval Bayeyian classif diffwave.pdf', type: 'application/pdf', taille: 1, id: 'a' },
      ],
    })
    .run();
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('recherche globale', () => {
  it('trouve tâche, message et fichier, sans tenir compte des accents ni de la casse', () => {
    const r = rechercher(h.db, 'diffwave EVALUATION');
    // Le nom du fichier ne contient pas « evaluation » : seuls la tâche et le message répondent.
    expect(r.map((x) => `${x.type}:${x.titre}`)).toEqual([
      'tache:Évaluation TP n°2 : DiffWave',
      'message:Validation TP pour 26-27/11',
    ]);
    expect(rechercher(h.db, 'diffwave').some((x) => x.type === 'fichier')).toBe(true);
    expect(r[1]?.detail).toContain('LEILA FERCHICHI');
  });

  it('matières par code, nom, enseignant ou alias', () => {
    expect(rechercher(h.db, 'tns')[0]).toMatchObject({ type: 'matiere', lien: '/matieres/TNS' });
    expect(rechercher(h.db, 'trabelsi').map((x) => x.titre)).toContain('Machine Learning');
  });

  it('début de mot seulement : « ml » ne trouve pas « html »', () => {
    creerTache(h.db, { titre: 'Corriger le html du site' });
    expect(rechercher(h.db, 'ml').map((x) => x.titre)).toEqual(['Machine Learning']);
    expect(rechercher(h.db, 'diffw').length).toBeGreaterThan(0);
  });

  it('requête vide ou trop courte : rien', () => {
    expect(rechercher(h.db, ' a ')).toEqual([]);
  });
});
