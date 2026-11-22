import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type DbHandle,
  applySeed,
  changerStatutTache,
  creerTache,
  modifierTache,
  openDb,
} from './index';
import { runMigrations } from './migrate';
import {
  delaiRappelHeures,
  enregistrerAbonnement,
  listerAbonnements,
  marquerRappelEnvoye,
  rappelsDus,
  reglerDelaiRappel,
  supprimerAbonnement,
} from './notifications';

let dir: string;
let h: DbHandle;
const tunis = (iso: string) => new Date(`${iso}+01:00`);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-notif-'));
  h = openDb(dir);
  runMigrations(h.db);
  applySeed(h.db);
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('rappels dus', () => {
  it('une fois par échéance, à nouveau si elle change, jamais pour une tâche terminée', () => {
    const id = creerTache(h.db, {
      titre: 'Évaluation TP',
      echeanceJour: '2026-11-26',
      echeanceHeure: '08:00',
    });
    const mardi = tunis('2026-11-24T09:00:00');
    expect(rappelsDus(h.db, tunis('2026-11-24T07:45:00'))).toEqual([]);
    const [r] = rappelsDus(h.db, mardi);
    expect(r?.titre).toBe('Évaluation TP');
    marquerRappelEnvoye(h.db, r!.itemId, r!.dueAt);
    expect(rappelsDus(h.db, mardi)).toEqual([]);

    // Report au vendredi : nouveau rappel le mercredi.
    modifierTache(h.db, id, {
      titre: 'Évaluation TP',
      echeanceJour: '2026-11-27',
      echeanceHeure: '08:00',
    });
    expect(rappelsDus(h.db, mardi)).toEqual([]);
    expect(rappelsDus(h.db, tunis('2026-11-25T09:00:00'))).toHaveLength(1);

    changerStatutTache(h.db, id, 'termine');
    expect(rappelsDus(h.db, tunis('2026-11-25T09:00:00'))).toEqual([]);
  });

  it('délai réglable (2 jours par défaut)', () => {
    expect(delaiRappelHeures(h.db)).toBe(48);
    creerTache(h.db, { titre: 'X', echeanceJour: '2026-11-26', echeanceHeure: '08:00' });
    reglerDelaiRappel(h.db, 24);
    expect(delaiRappelHeures(h.db)).toBe(24);
    expect(rappelsDus(h.db, tunis('2026-11-24T09:00:00'))).toEqual([]);
    expect(rappelsDus(h.db, tunis('2026-11-25T08:00:00'))).toHaveLength(1);
  });
});

describe('abonnements', () => {
  it('ajout, mise à jour du même appareil, suppression', () => {
    const a = {
      endpoint: 'https://web.push.apple.com/abc',
      p256dh: 'k',
      auth: 'a',
      appareil: 'iPhone',
    };
    enregistrerAbonnement(h.db, a);
    enregistrerAbonnement(h.db, { ...a, auth: 'b' });
    expect(listerAbonnements(h.db).map((x) => x.auth)).toEqual(['b']);
    supprimerAbonnement(h.db, a.endpoint);
    expect(listerAbonnements(h.db)).toEqual([]);
  });
});
