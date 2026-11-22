import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { sessionsOn, weekLabel } from '@tandhim/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type DbHandle,
  applySeed,
  backupDatabase,
  loadCalendarData,
  openDb,
  verifierSauvegarde,
} from './index';
import { runMigrations } from './migrate';
import { academicEvents, subjects } from './schema';

let dir: string;
let h: DbHandle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-test-'));
  h = openDb(dir);
  runMigrations(h.db);
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('base de données', () => {
  it('migrations idempotentes et mode WAL', () => {
    runMigrations(h.db);
    expect(h.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(h.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('données de départ : premier passage complet, second passage sans effet', () => {
    const empty = {
      subjects: 0,
      subjectsUpdated: 0,
      weeks: 0,
      events: 0,
      eventsUpdated: 0,
      eventsRemoved: 0,
      slots: 0,
    };
    expect(applySeed(h.db)).toEqual({ ...empty, subjects: 12, weeks: 28, events: 25, slots: 17 });
    expect(applySeed(h.db)).toEqual(empty);
  });

  it('dates du calendrier corrigées : mise à jour des lignes de départ, jamais des corrections manuelles', () => {
    applySeed(h.db);
    // Simule une base créée avec l'ancienne version des données de départ :
    const byKey = (kind: 'examens' | 'ferie_lunaire', startDate: string) =>
      and(eq(academicEvents.kind, kind), eq(academicEvents.startDate, startDate));
    h.db
      .update(academicEvents)
      .set({ endDate: '2027-05-27', status: 'a_confirmer' })
      .where(byKey('examens', '2027-05-13'))
      .run();
    h.db
      .insert(academicEvents)
      .values({
        kind: 'ferie_lunaire',
        title: 'Férié lunaire',
        startDate: '2027-07-07',
        endDate: '2027-07-07',
        source: 'seed',
      })
      .run();
    // … et une correction faite par Fares, qui doit être respectée :
    h.db
      .update(academicEvents)
      .set({ endDate: '2027-05-23', lockedByUser: true })
      .where(byKey('examens', '2027-05-20'))
      .run();

    const r = applySeed(h.db);
    expect(r.eventsUpdated).toBe(1);
    expect(r.eventsRemoved).toBe(1);
    const get = (kind: 'examens' | 'ferie_lunaire', d: string) =>
      h.db.select().from(academicEvents).where(byKey(kind, d)).get();
    expect(get('examens', '2027-05-13')).toMatchObject({
      endDate: '2027-05-15',
      status: 'confirme',
    });
    expect(get('examens', '2027-05-20')?.endDate).toBe('2027-05-23');
    expect(get('ferie_lunaire', '2027-07-07')).toBeUndefined();
    expect(get('ferie_lunaire', '2027-06-07')?.status).toBe('a_confirmer');
  });

  it('une matière de départ modifiée (ex. nouvelle couleur) est mise à jour en base', () => {
    applySeed(h.db);
    h.db.update(subjects).set({ color: '#123456' }).where(eq(subjects.code, 'ML')).run();
    expect(applySeed(h.db).subjectsUpdated).toBe(1);
    expect(h.db.select().from(subjects).where(eq(subjects.code, 'ML')).get()?.color).toBe(
      '#c9b8ff',
    );
  });

  it('une correction manuelle n’est pas écrasée par un nouveau passage', () => {
    applySeed(h.db);
    h.db
      .update(subjects)
      .set({ color: '#000000', lockedByUser: true })
      .where(eq(subjects.code, 'ML'))
      .run();
    applySeed(h.db);
    expect(h.db.select().from(subjects).where(eq(subjects.code, 'ML')).get()?.color).toBe(
      '#000000',
    );
  });

  it('le calendrier relu depuis la base donne les mêmes séances que la spec', () => {
    applySeed(h.db);
    const data = loadCalendarData(h.db);
    expect(weekLabel('2026-11-26', data)).toBe('Sem.13 (b)');
    expect(
      sessionsOn('2026-11-26', data).map((s) => `${s.slot} ${s.subjectCode} ${s.room}`),
    ).toEqual(['C1 TNS LI177', 'C2 ANG 229', 'C3 COM 249', 'C4 ML A6', 'C5 ML LI210']);
    expect(data.events.filter((e) => e.title === 'Examens S2').map((e) => e.status)).toEqual([
      'confirme',
      'confirme',
      'confirme',
    ]);
    expect(data.events.find((e) => e.kind === 'ferie_lunaire')?.status).toBe('a_confirmer');
  });

  it('sauvegarde lisible, une par jour, les plus anciennes supprimées', async () => {
    applySeed(h.db);
    const backups = join(dir, 'backups');
    for (let d = 1; d <= 4; d++) {
      await backupDatabase(h.sqlite, backups, 3, new Date(`2026-11-0${d}T12:00:00Z`));
    }
    const files = readdirSync(backups).sort();
    expect(files).toEqual([
      'tandhim-2026-11-02.db',
      'tandhim-2026-11-03.db',
      'tandhim-2026-11-04.db',
    ]);

    // Restauration : la copie s'ouvre et contient les données.
    const copy = new Database(join(backups, 'tandhim-2026-11-04.db'), { readonly: true });
    expect(copy.prepare('select count(*) as n from timetable_slots').get()).toEqual({ n: 17 });
    copy.close();
    expect(existsSync(join(backups, 'tandhim-2026-11-01.db'))).toBe(false);
    // Fichier autonome : pas de journal WAL à côté, même après lecture.
    expect(readdirSync(backups).some((f) => f.endsWith('-wal') || f.endsWith('-shm'))).toBe(false);
    expect(verifierSauvegarde(join(backups, 'tandhim-2026-11-04.db'))).toMatchObject({
      ok: true,
      integrite: 'ok',
      taches: 0,
    });
    // Fichier abîmé : signalé, pas d'exception silencieuse.
    writeFileSync(join(backups, 'abime.db'), 'pas une base sqlite');
    expect(() => verifierSauvegarde(join(backups, 'abime.db'))).toThrow();
  });
});
