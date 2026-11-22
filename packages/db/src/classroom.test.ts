import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  delaiNouvelEssaiMs,
  enregistrerCompte,
  listerCours,
  listerEtatsSync,
  majCours,
  majDevoir,
  nettoyerClassroom,
  reglerCours,
  syncEchouee,
  syncEnAttente,
  syncReussie,
} from './classroom';
import { type DbHandle, applySeed, changerStatutTache, listerTaches, openDb } from './index';
import { runMigrations } from './migrate';
import { items, subjects } from './schema';

let dir: string;
let h: DbHandle;
let compte: number;
let str: number;

const maintenant = new Date('2026-11-23T09:00:00Z');
const jours = (n: number) => new Date(maintenant.getTime() + n * 86_400_000);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-classroom-'));
  h = openDb(dir);
  runMigrations(h.db);
  applySeed(h.db);
  compte = enregistrerCompte(h.db, {
    email: 'fac@exemple.tn',
    label: 'fac',
    refreshTokenEnc: 'v1:x:y:z',
    scopes: 's',
  });
  str = h.db.select().from(subjects).where(eq(subjects.code, 'STR')).get()!.id;
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('comptes et cours', () => {
  it('reconnecter un compte met à jour la ligne existante (même e-mail)', () => {
    const id = enregistrerCompte(h.db, {
      email: 'fac@exemple.tn',
      label: 'fac',
      refreshTokenEnc: 'v1:a:b:c',
      scopes: 's2',
    });
    expect(id).toBe(compte);
  });

  it('nouveaux cours : matière proposée et suivi si reconnu ; les choix de Fares sont conservés', () => {
    majCours(h.db, compte, [
      { googleId: 'c1', name: 'STR-2026' },
      { googleId: 'c2', name: 'Algèbre linéaire' },
    ]);
    let cours = listerCours(h.db);
    const c1 = cours.find((c) => c.cours.googleId === 'c1')!;
    const c2 = cours.find((c) => c.cours.googleId === 'c2')!;
    expect(c1.matiere?.code).toBe('STR');
    expect(c1.cours).toMatchObject({ followed: true, suggested: true });
    expect(c2.cours).toMatchObject({ followed: false, subjectId: null });

    reglerCours(h.db, c1.cours.id, { subjectId: null, followed: false });
    majCours(h.db, compte, [{ googleId: 'c1', name: 'STR-2026 (renommé)' }]);
    cours = listerCours(h.db);
    expect(cours.find((c) => c.cours.googleId === 'c1')!.cours).toMatchObject({
      name: 'STR-2026 (renommé)',
      followed: false,
      suggested: false,
      subjectId: null,
    });
  });
});

describe('devoirs Classroom', () => {
  const ctx = () => ({ accountId: compte, subjectId: str, rendusSurClassroom: true });
  const devoir = (p: Partial<Parameters<typeof majDevoir>[2]> = {}) => ({
    googleId: 'w1',
    titre: 'TP 3 : sémaphores',
    echeance: jours(3),
    jourEntier: true,
    rendu: false,
    ...p,
  });

  it('créé une seule fois, puis mis à jour ; terminé automatiquement quand il est rendu', () => {
    expect(majDevoir(h.db, ctx(), devoir(), maintenant)).toBe('cree');
    expect(majDevoir(h.db, ctx(), devoir(), maintenant)).toBe('inchange');
    expect(majDevoir(h.db, ctx(), devoir({ titre: 'TP 3 : sémaphores (v2)' }), maintenant)).toBe(
      'maj',
    );
    expect(listerTaches(h.db)).toHaveLength(1);
    expect(majDevoir(h.db, ctx(), devoir({ rendu: true }), maintenant)).toBe('maj');
    expect(listerTaches(h.db)[0]).toMatchObject({ statut: 'termine', source: 'classroom' });
    expect(listerTaches(h.db)[0]?.matiere?.code).toBe('STR');
  });

  it('rendu incertain seulement pour une matière où l’on ne rend pas sur Classroom', () => {
    majDevoir(h.db, ctx(), devoir(), maintenant);
    expect(listerTaches(h.db)[0]?.renduIncertain).toBe(false); // STR : rendus sur Classroom
    const tns = h.db.select().from(subjects).where(eq(subjects.code, 'TNS')).get()!.id;
    majDevoir(
      h.db,
      { ...ctx(), subjectId: tns, rendusSurClassroom: false },
      devoir({ googleId: 'w2' }),
      maintenant,
    );
    expect(listerTaches(h.db).find((t) => t.matiere?.code === 'TNS')?.renduIncertain).toBe(true);
  });

  it('rendu puis repris par l’étudiant → de nouveau à faire', () => {
    majDevoir(h.db, ctx(), devoir({ rendu: true }), maintenant);
    majDevoir(h.db, ctx(), devoir({ rendu: false }), maintenant);
    expect(listerTaches(h.db)[0]?.statut).toBe('a_faire');
  });

  it('une tâche cochée ou corrigée par Fares n’est plus modifiée par la synchro', () => {
    majDevoir(h.db, ctx(), devoir(), maintenant);
    changerStatutTache(h.db, listerTaches(h.db)[0]!.id, 'termine');
    expect(majDevoir(h.db, ctx(), devoir({ titre: 'autre' }), maintenant)).toBe('verrouille');
    expect(listerTaches(h.db)[0]).toMatchObject({ titre: 'TP 3 : sémaphores', statut: 'termine' });
  });

  it('premier import : vieux devoirs ignorés, sauf vrai retard sur Classroom', () => {
    const vieux = devoir({ googleId: 'old', echeance: jours(-30) });
    expect(majDevoir(h.db, { ...ctx(), rendusSurClassroom: false }, vieux, maintenant)).toBe(
      'ignore',
    );
    expect(majDevoir(h.db, ctx(), vieux, maintenant)).toBe('cree'); // STR : vrai retard
    expect(
      majDevoir(
        h.db,
        ctx(),
        devoir({ googleId: 'old2', echeance: jours(-30), rendu: true }),
        maintenant,
      ),
    ).toBe('ignore');
  });

  it('déjà rendu à l’import : terminé à la date d’échéance (pas « terminé cette semaine »)', () => {
    majDevoir(h.db, ctx(), devoir({ echeance: jours(-2), rendu: true }), maintenant);
    const row = h.db.select().from(items).get()!;
    expect(row.completedAt).toBe(jours(-2).toISOString());
  });
});

describe('nettoyage', () => {
  it('retire les devoirs qui ne sont plus vus, sauf ceux modifiés par Fares', () => {
    const ctx = { accountId: compte, subjectId: str, rendusSurClassroom: true };
    const d = (googleId: string) => ({
      googleId,
      titre: googleId,
      echeance: jours(2),
      jourEntier: true,
      rendu: false,
    });
    majDevoir(h.db, ctx, d('garde'), maintenant);
    majDevoir(h.db, ctx, d('disparu'), maintenant);
    majDevoir(h.db, ctx, d('modifie'), maintenant);
    changerStatutTache(h.db, listerTaches(h.db).find((t) => t.titre === 'modifie')!.id, 'termine');
    expect(nettoyerClassroom(h.db, compte, new Set(['garde']))).toBe(1);
    expect(
      listerTaches(h.db)
        .map((t) => t.titre)
        .sort(),
    ).toEqual(['garde', 'modifie']);
  });
});

describe('état des synchros', () => {
  it('backoff : 15 min, 30, 60… plafonné à 6 h ; remis à zéro après un succès', () => {
    expect(delaiNouvelEssaiMs(1)).toBe(15 * 60_000);
    expect(delaiNouvelEssaiMs(3)).toBe(60 * 60_000);
    expect(delaiNouvelEssaiMs(20)).toBe(6 * 3_600_000);
    syncEchouee(h.db, 'classroom:1', 'Classroom (fac)', 'invalid_grant');
    syncEchouee(h.db, 'classroom:1', 'Classroom (fac)', 'invalid_grant');
    expect(listerEtatsSync(h.db)[0]).toMatchObject({
      consecutiveFailures: 2,
      lastError: 'invalid_grant',
    });
    expect(syncEnAttente(h.db, 'classroom:1')).toBe(true);
    syncReussie(h.db, 'classroom:1', 'Classroom (fac)', '3 cours suivis');
    expect(listerEtatsSync(h.db)[0]).toMatchObject({ consecutiveFailures: 0, nextRetryAt: null });
    expect(syncEnAttente(h.db, 'classroom:1')).toBe(false);
  });
});
