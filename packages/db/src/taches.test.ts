import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DbHandle, applySeed, openDb } from './index';
import { runMigrations } from './migrate';
import { items, subjects } from './schema';
import {
  changerStatutProjet,
  changerStatutTache,
  creerProjet,
  creerTache,
  listerProjets,
  listerTaches,
  modifierTache,
  reporterTache,
  restaurerEcheance,
  supprimerProjet,
} from './taches';

let dir: string;
let h: DbHandle;
let ml: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-taches-'));
  h = openDb(dir);
  runMigrations(h.db);
  applySeed(h.db);
  ml = h.db.select().from(subjects).where(eq(subjects.code, 'ML')).get()!.id;
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('tâches', () => {
  it('échéance « jour entier » à 23:59 heure de Tunis, ou à l’heure donnée', () => {
    const a = creerTache(h.db, { titre: '  Compte rendu TNS ', echeanceJour: '2026-12-03' });
    const b = creerTache(h.db, {
      titre: 'Rendu STR',
      echeanceJour: '2026-12-03',
      echeanceHeure: '08:00',
    });
    const trouver = (id: number) => listerTaches(h.db).find((t) => t.id === id)!;
    const ta = trouver(a);
    const tb = trouver(b);
    expect(ta.titre).toBe('Compte rendu TNS');
    expect(ta.echeance?.toISOString()).toBe('2026-12-03T22:59:00.000Z');
    expect(ta.echeanceJourEntier).toBe(true);
    expect(tb.echeance?.toISOString()).toBe('2026-12-03T07:00:00.000Z');
    expect(tb.echeanceJourEntier).toBe(false);
  });

  it('matière jointe, saisie manuelle verrouillée contre les synchros', () => {
    const id = creerTache(h.db, { titre: 'TP ML', matiereId: ml, importance: 'haute' });
    const t = listerTaches(h.db)[0]!;
    expect(t.matiere).toMatchObject({ code: 'ML', nom: 'Machine Learning' });
    expect(t.importance).toBe('haute');
    expect(h.db.select().from(items).where(eq(items.id, id)).get()?.lockedByUser).toBe(true);
  });

  it('cocher / décocher, et filtrer les tâches ouvertes', () => {
    const id = creerTache(h.db, { titre: 'X' });
    changerStatutTache(h.db, id, 'termine');
    expect(listerTaches(h.db, { ouvertes: true })).toHaveLength(0);
    expect(listerTaches(h.db)[0]?.termineLe).toBeInstanceOf(Date);
    changerStatutTache(h.db, id, 'a_faire');
    expect(listerTaches(h.db, { ouvertes: true })[0]?.termineLe).toBeNull();
  });

  it('modifier une tâche efface son badge « à vérifier »', () => {
    const id = creerTache(h.db, { titre: 'Y' });
    h.db.update(items).set({ needsReview: true }).where(eq(items.id, id)).run();
    modifierTache(h.db, id, { titre: 'Y corrigé', echeanceJour: '2026-12-01' });
    const t = listerTaches(h.db)[0]!;
    expect(t).toMatchObject({ titre: 'Y corrigé', aVerifier: false });
  });
});

describe('projets', () => {
  it('avancement calculé à partir des tâches, couleur de la matière pour un projet de cours', () => {
    const p = creerProjet(h.db, {
      titre: 'Projet ML',
      type: 'cours',
      matiereId: ml,
      echeance: '2026-12-10',
    });
    const t1 = creerTache(h.db, { titre: 'Données', projetId: p });
    creerTache(h.db, { titre: 'Modèle', projetId: p });
    creerTache(h.db, { titre: 'Rapport', projetId: p });
    changerStatutTache(h.db, t1, 'termine');
    const [projet] = listerProjets(h.db);
    expect(projet).toMatchObject({
      titre: 'Projet ML',
      couleur: '#c9b8ff',
      tachesTotal: 3,
      tachesFaites: 1,
      avancement: 33,
    });
    expect(listerTaches(h.db, { projetId: p })).toHaveLength(3);
  });

  it('projets avec échéance d’abord, la plus proche en premier', () => {
    creerProjet(h.db, { titre: 'Sans date', type: 'perso' });
    creerProjet(h.db, { titre: 'Loin', type: 'perso', echeance: '2026-12-20' });
    creerProjet(h.db, { titre: 'Proche', type: 'perso', echeance: '2026-12-01' });
    expect(listerProjets(h.db).map((p) => p.titre)).toEqual(['Proche', 'Loin', 'Sans date']);
  });

  it('projet perso : couleur par défaut ; filtre « en cours » ; suppression avec ses tâches', () => {
    const p = creerProjet(h.db, { titre: 'Portfolio', type: 'perso' });
    creerTache(h.db, { titre: 'Maquette', projetId: p });
    expect(listerProjets(h.db)[0]?.couleur).toBe('#ffc567');
    changerStatutProjet(h.db, p, 'termine');
    expect(listerProjets(h.db, { enCours: true })).toHaveLength(0);
    supprimerProjet(h.db, p);
    expect(listerTaches(h.db)).toHaveLength(0);
  });
});

describe('reporter une tâche (geste « glisser à gauche »)', () => {
  const samedi = new Date('2026-11-21T10:00:00Z');
  const echeance = (id: number) => h.db.select().from(items).where(eq(items.id, id)).get()!;

  it('garde l’heure, décale d’un jour, et « Annuler » remet tout', () => {
    const id = creerTache(h.db, {
      titre: 'TP',
      echeanceJour: '2026-11-26',
      echeanceHeure: '08:00',
    });
    const avant = reporterTache(h.db, id, 1, samedi)!;
    expect(echeance(id)).toMatchObject({ dueAt: '2026-11-27T07:00:00.000Z', dueAllDay: false });
    restaurerEcheance(h.db, id, avant);
    expect(echeance(id)).toMatchObject({ dueAt: '2026-11-26T07:00:00.000Z', dueAllDay: false });
  });

  it('sans échéance : demain, jour entier', () => {
    const id = creerTache(h.db, { titre: 'Lire le cours' });
    reporterTache(h.db, id, 1, samedi);
    expect(echeance(id)).toMatchObject({ dueAt: '2026-11-22T22:59:00.000Z', dueAllDay: true });
  });

  it('échéance passée : reportée à partir d’aujourd’hui (en gardant l’heure)', () => {
    const id = creerTache(h.db, {
      titre: 'CR',
      echeanceJour: '2026-11-19',
      echeanceHeure: '14:00',
    });
    reporterTache(h.db, id, 1, samedi);
    expect(echeance(id)).toMatchObject({ dueAt: '2026-11-22T13:00:00.000Z', dueAllDay: false });
  });
});
