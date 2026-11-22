import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DbHandle, openDb } from './index';
import {
  appliquerVotes,
  ecrireReglage,
  enregistrerSondage,
  lireReglage,
  marquerSondageEnvoye,
  sondagesParId,
} from './messenger';
import { runMigrations } from './migrate';

let dir: string;
let h: DbHandle;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-messenger-'));
  h = openDb(dir);
  runMigrations(h.db);
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const sondage = {
  id: '$p',
  auteur: 'Étudiant A',
  date: new Date('2026-11-18T08:00:00Z'),
  question: 'Rattrapage ?',
  options: [
    { id: 'a', texte: 'Mardi' },
    { id: 'b', texte: 'Jeudi' },
  ],
};
const vote = (votant: string, minute: number, choix: string[]) => ({
  sondageId: '$p',
  votant,
  date: new Date(`2026-11-18T08:${String(minute).padStart(2, '0')}:00Z`),
  choix,
});

describe('sondages Messenger (base)', () => {
  it('votes cumulés d’une synchro à l’autre, dernier vote retenu, clôture', () => {
    enregistrerSondage(h.db, '!salon', sondage);
    enregistrerSondage(h.db, '!salon', sondage); // déjà connu : rien ne change
    expect(appliquerVotes(h.db, [vote('x', 1, ['a']), vote('y', 2, ['b'])])).toEqual(['$p']);
    // Synchro suivante : x change d'avis ; un vote plus ancien arrivé en retard est ignoré.
    appliquerVotes(h.db, [vote('x', 5, ['b']), vote('y', 0, ['a'])], ['$p']);
    const [s] = sondagesParId(h.db, ['$p']);
    expect(s?.votes.x?.choix).toEqual(['b']);
    expect(s?.votes.y?.choix).toEqual(['b']);
    expect(s?.clos).toBe(true);
    marquerSondageEnvoye(h.db, '$p', 'b:clos');
    expect(sondagesParId(h.db, ['$p'])[0]?.signatureEnvoyee).toBe('b:clos');
  });

  it('vote d’un sondage inconnu : ignoré', () => {
    expect(appliquerVotes(h.db, [vote('x', 1, ['a'])])).toEqual([]);
  });

  it('état de lecture d’un salon', () => {
    expect(lireReglage(h.db, 'messenger.jeton.!s')).toBeUndefined();
    ecrireReglage(h.db, 'messenger.jeton.!s', 't1');
    ecrireReglage(h.db, 'messenger.jeton.!s', 't2');
    expect(lireReglage<string>(h.db, 'messenger.jeton.!s')).toBe('t2');
  });
});
