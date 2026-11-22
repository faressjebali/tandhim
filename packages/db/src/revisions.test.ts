import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DbHandle, applySeed, creerTache, modifierTache, openDb } from './index';
import { runMigrations } from './migrate';
import {
  basculerSeanceRevision,
  epreuvesAVenir,
  listerSeancesRevision,
  recalculerRevisions,
  reglerRevision,
} from './revisions';
import { items } from './schema';

let dir: string;
let h: DbHandle;
const tunis = (iso: string) => new Date(`${iso}+01:00`);
const lundi = tunis('2026-12-14T08:00:00');
const tout = () =>
  listerSeancesRevision(h.db, tunis('2026-12-01T00:00:00'), tunis('2027-02-01T00:00:00'));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-revisions-'));
  h = openDb(dir);
  runMigrations(h.db);
  applySeed(h.db);
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const examen = (titre: string, jour: string) => {
  const id = creerTache(h.db, { titre, echeanceJour: jour, echeanceHeure: '09:00' });
  h.db.update(items).set({ type: 'examen' }).where(eq(items.id, id)).run();
  return id;
};

describe('planning de révision (base)', () => {
  it('seules les épreuves (DS, examens) datées et à venir sont planifiées', () => {
    examen('Examen ML', '2026-12-28');
    creerTache(h.db, { titre: 'Rendu TP', echeanceJour: '2026-12-20' });
    expect(epreuvesAVenir(h.db, lundi).map((e) => e.titre)).toEqual(['Examen ML']);
    expect(recalculerRevisions(h.db, lundi)).toBe(4);
    expect(tout().every((s) => s.epreuve.titre === 'Examen ML')).toBe(true);
  });

  it('recalcul : séance faite gardée et comptée ; date changée → planning déplacé', () => {
    const id = examen('Examen ML', '2026-12-28');
    recalculerRevisions(h.db, lundi);
    const premiere = tout()[0]!;
    basculerSeanceRevision(h.db, premiere.id, true);
    recalculerRevisions(h.db, lundi);
    expect(tout()).toHaveLength(4);
    expect(
      tout()
        .filter((s) => s.faite)
        .map((s) => s.id),
    ).toEqual([premiere.id]);

    modifierTache(h.db, id, {
      titre: 'Examen ML',
      echeanceJour: '2027-01-05',
      echeanceHeure: '09:00',
    });
    recalculerRevisions(h.db, lundi);
    const aFaire = tout().filter((s) => !s.faite);
    expect(aFaire).toHaveLength(3);
    expect(aFaire.every((s) => s.debut > tunis('2026-12-25T00:00:00'))).toBe(true);
  });

  it('réglages : nombre de séances par épreuve', () => {
    examen('Examen ML', '2026-12-28');
    reglerRevision(h.db, { seancesParEpreuve: 2 });
    expect(recalculerRevisions(h.db, lundi)).toBe(2);
  });
});
