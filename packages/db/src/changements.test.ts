import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type NouveauChangement,
  changementsANotifier,
  enregistrerChangement,
  ignorerChangement,
  listerChangements,
  marquerChangementNotifie,
} from './changements';
import { type DbHandle, applySeed, openDb } from './index';
import { runMigrations } from './migrate';
import { subjects } from './schema';

let dir: string;
let h: DbHandle;
let c: NouveauChangement;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-chgt-'));
  h = openDb(dir);
  runMigrations(h.db);
  applySeed(h.db);
  const tns = h.db.select().from(subjects).where(eq(subjects.code, 'TNS')).get()!.id;
  c = {
    subjectId: tns,
    jour: '2026-11-26',
    creneau: 'C1',
    heure: '08:00',
    nature: 'en_ligne',
    nouveauJour: null,
    nouveauCreneau: null,
    nouvelleHeure: null,
    lien: 'https://meet.google.com/abc',
    salle: null,
    sourceItemId: null,
    citation: 'séance en ligne jeudi à 8h',
    confiance: 0.9,
  };
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('changements de séance', () => {
  it('un seul changement par séance ; le plus récent l’emporte sans effacer le lien', () => {
    expect(enregistrerChangement(h.db, c)).toBe('cree');
    expect(enregistrerChangement(h.db, { ...c, nature: 'annulee', lien: null })).toBe('maj');
    const [x] = listerChangements(h.db, '2026-11-23', '2026-11-29');
    expect(listerChangements(h.db, '2026-11-23', '2026-11-29')).toHaveLength(1);
    expect(x).toMatchObject({
      matiere: 'TNS',
      nature: 'annulee',
      lien: 'https://meet.google.com/abc',
    });
  });

  it('un report apparaît aussi la semaine du nouveau jour', () => {
    enregistrerChangement(h.db, {
      ...c,
      nature: 'reportee',
      nouveauJour: '2026-12-02',
      nouveauCreneau: 'C3',
    });
    expect(listerChangements(h.db, '2026-11-30', '2026-12-06')).toHaveLength(1);
    expect(listerChangements(h.db, '2026-12-07', '2026-12-13')).toHaveLength(0);
  });

  it('écarté par Fares : plus affiché, jamais recréé', () => {
    enregistrerChangement(h.db, c);
    const [x] = listerChangements(h.db, '2026-11-26', '2026-11-26');
    ignorerChangement(h.db, x!.id);
    expect(enregistrerChangement(h.db, { ...c, nature: 'annulee' })).toBe('ignore');
    expect(listerChangements(h.db, '2026-11-26', '2026-11-26')).toEqual([]);
  });

  it('notifié une fois ; renotifié si le changement change de nature', () => {
    enregistrerChangement(h.db, c);
    const [x] = changementsANotifier(h.db, '2026-11-25', '2026-11-27');
    marquerChangementNotifie(h.db, x!.id);
    expect(changementsANotifier(h.db, '2026-11-25', '2026-11-27')).toEqual([]);
    enregistrerChangement(h.db, c); // même information : pas de nouvelle notification
    expect(changementsANotifier(h.db, '2026-11-25', '2026-11-27')).toEqual([]);
    enregistrerChangement(h.db, { ...c, nature: 'annulee' });
    expect(changementsANotifier(h.db, '2026-11-25', '2026-11-27')).toHaveLength(1);
  });
});

describe('séances hors créneau', () => {
  it('deux séances du soir le même jour restent distinctes ; même heure = même séance', () => {
    const soir = { ...c, creneau: null, heure: '18:30', lien: '105437426' };
    expect(enregistrerChangement(h.db, soir)).toBe('cree');
    expect(enregistrerChangement(h.db, { ...soir, heure: '20:00' })).toBe('cree');
    expect(enregistrerChangement(h.db, { ...soir, heure: '20:00' })).toBe('maj');
    expect(
      listerChangements(h.db, '2026-11-26', '2026-11-26')
        .map((x) => x.heure)
        .sort(),
    ).toEqual(['18:30', '20:00']);
  });
});
