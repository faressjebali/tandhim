import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type DbHandle,
  applySeed,
  creerProjet,
  creerTache,
  listerProjets,
  listerTaches,
  openDb,
} from './index';
import { runMigrations } from './migrate';
import { fusionnerProjets, rangerDansProjet, retirerProjet, validerProjet } from './projets-ia';
import { items, subjects } from './schema';

let dir: string;
let h: DbHandle;
let rhd: number;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-projets-'));
  h = openDb(dir);
  runMigrations(h.db);
  applySeed(h.db);
  rhd = h.db.select().from(subjects).where(eq(subjects.code, 'RHD')).get()!.id;
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});
const tacheIa = (titre: string) => {
  const id = creerTache(h.db, { titre, matiereId: rhd });
  h.db.update(items).set({ lockedByUser: false, source: 'ia' }).where(eq(items.id, id)).run();
  return id;
};

describe('projets de cours proposés par l’IA', () => {
  it('créé pour un vrai projet (2 étapes ou plus), « à vérifier » ; tâches suivantes rangées', () => {
    const a = tacheIa('Remise de la conception');
    const b = tacheIa('Remise finale');
    const p = rangerDansProjet(h.db, a, { titre: 'Projet RHD', etapes: 2 }, rhd);
    expect(rangerDansProjet(h.db, b, { titre: 'Projet de TP RHD', etapes: 2 }, rhd)).toBe(p);
    expect(listerProjets(h.db)[0]).toMatchObject({
      titre: 'Projet RHD',
      source: 'ia',
      aVerifier: true,
      tachesTotal: 2,
    });
  });

  it('pas de projet pour une tâche isolée ; jamais une tâche modifiée par Fares', () => {
    expect(rangerDansProjet(h.db, tacheIa('TD 3'), { titre: 'TD', etapes: 1 }, rhd)).toBeNull();
    const fares = creerTache(h.db, { titre: 'Ma remise', matiereId: rhd });
    expect(rangerDansProjet(h.db, fares, { titre: 'Projet RHD', etapes: 2 }, rhd)).toBeNull();
    expect(listerProjets(h.db)).toEqual([]);
  });

  it('projet perso de Fares jamais touché ; son projet de cours relié à la matière : utilisé', () => {
    creerProjet(h.db, { titre: 'Révisions perso', type: 'perso' });
    const cours = creerProjet(h.db, { titre: 'Mon projet RHD', type: 'cours', matiereId: rhd });
    expect(
      rangerDansProjet(h.db, tacheIa('Livrable 1'), { titre: 'Projet RHD', etapes: 3 }, rhd),
    ).toBe(cours);
  });

  it('valider, fusionner (tâches déplacées), supprimer (tâches gardées)', () => {
    const a = tacheIa('Conception');
    const p1 = rangerDansProjet(h.db, a, { titre: 'Projet RHD', etapes: 2 }, rhd)!;
    validerProjet(h.db, p1);
    expect(listerProjets(h.db)[0]?.aVerifier).toBe(false);
    const p2 = creerProjet(h.db, { titre: 'Projet réseaux', type: 'cours', matiereId: rhd });
    fusionnerProjets(h.db, p1, p2);
    expect(listerTaches(h.db).find((t) => t.id === a)?.projet?.id).toBe(p2);
    retirerProjet(h.db, p2);
    expect(listerTaches(h.db).find((t) => t.id === a)?.projet).toBeNull();
  });
});
