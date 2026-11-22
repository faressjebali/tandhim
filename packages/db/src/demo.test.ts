import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROFS_DEMO } from '@tandhim/core';
import { type DbHandle, appliquerDemo, applySeed, listerTaches, openDb } from './index';
import { runMigrations } from './migrate';
import { subjects, timetableSlots } from './schema';

let dir: string;
let h: DbHandle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-demo-'));
  h = openDb(dir);
  runMigrations(h.db);
  applySeed(h.db);
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('mode démo', () => {
  it('remplit la base une seule fois, avec des tâches autour du jour de la démo', () => {
    const maintenant = new Date('2026-11-24T09:00:00Z');
    expect(appliquerDemo(h.db, maintenant)).toBe(true);
    expect(appliquerDemo(h.db, maintenant)).toBe(false);
    const taches = listerTaches(h.db, {});
    expect(taches.length).toBeGreaterThanOrEqual(8);
    expect(taches.some((t) => t.aVerifier)).toBe(true);
  });

  it('ne garde que des enseignants inventés', () => {
    appliquerDemo(h.db, new Date('2026-11-24T09:00:00Z'));
    const inventes = new Set(Object.values(PROFS_DEMO));
    for (const s of h.db.select().from(subjects).all()) expect(inventes).toContain(s.teacher);
    for (const c of h.db.select().from(timetableSlots).all()) expect(inventes).toContain(c.teacher);
  });

  it('se place dans l’année du calendrier quand la date réelle en sort', () => {
    expect(appliquerDemo(h.db, new Date('2030-03-10T09:00:00Z'))).toBe(true);
    const echeances = listerTaches(h.db, {}).flatMap((t) => (t.echeance ? [t.echeance] : []));
    for (const e of echeances) expect(e.getUTCFullYear()).toBeLessThanOrEqual(2027);
  });
});

describe('horloge de démo', () => {
  it('TANDHIM_DEMO_DATE fige l’instant (heure de Tunis)', async () => {
    const { maintenantDemo } = await import('@tandhim/core');
    expect(maintenantDemo(new Date('2030-01-01T00:00:00Z'), '2026-11-24T10:05').toISOString()).toBe(
      '2026-11-24T09:05:00.000Z',
    );
    expect(maintenantDemo(new Date('2026-11-20T08:00:00Z'), 'mauvais format').toISOString()).toBe(
      '2026-11-20T08:00:00.000Z',
    );
  });
});
