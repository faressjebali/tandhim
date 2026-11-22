/**
 * Comptes Google, cours Classroom, devoirs importés et état des synchros.
 */
import { type MatiereRapprochable, rapprocherMatiere } from '@tandhim/core';
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from './client';
import { accounts, classroomCourses, classroomPosts, items, subjects, syncStatus } from './schema';

const maintenantIso = () => new Date().toISOString();
const JOUR_MS = 86_400_000;

// --- Comptes ---------------------------------------------------------------

export function enregistrerCompte(
  db: Db,
  c: { email: string; label: string; refreshTokenEnc: string; scopes: string },
): number {
  return db
    .insert(accounts)
    .values({ provider: 'google', ...c, status: 'ok' })
    .onConflictDoUpdate({
      target: accounts.email,
      set: { ...c, status: 'ok', updatedAt: maintenantIso() },
    })
    .returning({ id: accounts.id })
    .get().id;
}

export const listerComptes = (db: Db) => db.select().from(accounts).orderBy(asc(accounts.id)).all();

export function marquerCompte(db: Db, id: number, status: 'ok' | 'a_reconnecter'): void {
  db.update(accounts).set({ status, updatedAt: maintenantIso() }).where(eq(accounts.id, id)).run();
}

export function supprimerCompte(db: Db, id: number): void {
  db.delete(accounts).where(eq(accounts.id, id)).run();
}

// --- Cours -----------------------------------------------------------------

export interface CoursDistant {
  googleId: string;
  name: string;
  section?: string | null;
  link?: string | null;
}

/** Met à jour la liste des cours d'un compte ; propose une matière aux nouveaux cours. */
export function majCours(db: Db, accountId: number, cours: CoursDistant[]): void {
  const matieres: MatiereRapprochable[] = db
    .select({
      id: subjects.id,
      code: subjects.code,
      name: subjects.name,
      aliases: subjects.aliases,
    })
    .from(subjects)
    .all();
  const vu = maintenantIso();
  db.transaction((tx) => {
    for (const c of cours) {
      const existant = tx
        .select()
        .from(classroomCourses)
        .where(
          and(eq(classroomCourses.accountId, accountId), eq(classroomCourses.googleId, c.googleId)),
        )
        .get();
      if (existant) {
        tx.update(classroomCourses)
          .set({ name: c.name, section: c.section ?? null, link: c.link ?? null, lastSeenAt: vu })
          .where(eq(classroomCourses.id, existant.id))
          .run();
      } else {
        const matiere = rapprocherMatiere(c.name, matieres);
        tx.insert(classroomCourses)
          .values({
            accountId,
            googleId: c.googleId,
            name: c.name,
            section: c.section ?? null,
            link: c.link ?? null,
            subjectId: matiere?.id ?? null,
            followed: matiere !== null,
            suggested: true,
            lastSeenAt: vu,
          })
          .run();
      }
    }
  });
}

export function listerCours(db: Db) {
  return db
    .select({
      cours: classroomCourses,
      compte: { id: accounts.id, email: accounts.email, label: accounts.label },
      matiere: { id: subjects.id, code: subjects.code, name: subjects.name, color: subjects.color },
    })
    .from(classroomCourses)
    .innerJoin(accounts, eq(classroomCourses.accountId, accounts.id))
    .leftJoin(subjects, eq(classroomCourses.subjectId, subjects.id))
    .orderBy(asc(accounts.id), asc(classroomCourses.name))
    .all();
}

/** Choix de Fares pour un cours : matière et suivi (confirme la suggestion). */
export function reglerCours(
  db: Db,
  id: number,
  r: { subjectId: number | null; followed: boolean },
): void {
  db.update(classroomCourses)
    .set({ subjectId: r.subjectId, followed: r.followed, suggested: false })
    .where(eq(classroomCourses.id, id))
    .run();
}

// --- Devoirs ---------------------------------------------------------------

export interface DevoirDistant {
  googleId: string;
  titre: string;
  description?: string | null;
  echeance: Date | null;
  jourEntier: boolean;
  lien?: string | null;
  rendu: boolean;
}

/** Au premier import, on ignore les devoirs dont l'échéance est passée depuis plus de 7 jours… */
const IGNORER_PASSES_DEPUIS_JOURS = 7;

export type ResultatDevoir = 'cree' | 'maj' | 'inchange' | 'ignore' | 'verrouille';

/**
 * Crée ou met à jour la tâche d'un devoir Classroom.
 * - jamais de doublon (source + id Classroom) ;
 * - rendu sur Classroom → terminé automatiquement ;
 * - une tâche corrigée ou cochée par Fares (lockedByUser) n'est plus modifiée ;
 * - nouveaux devoirs déjà passés depuis plus de 7 jours ignorés, sauf vrai retard
 *   dans une matière où l'on rend sur Classroom.
 */
export function majDevoir(
  db: Db,
  ctx: { accountId: number; subjectId: number | null; rendusSurClassroom: boolean },
  d: DevoirDistant,
  maintenant: Date = new Date(),
): ResultatDevoir {
  const existant = db
    .select()
    .from(items)
    .where(and(eq(items.source, 'classroom'), eq(items.externalId, d.googleId)))
    .get();
  const statut = d.rendu ? 'termine' : 'a_faire';
  const champs = {
    title: d.titre.trim() || 'Devoir Classroom',
    description: d.description?.trim() || null,
    subjectId: ctx.subjectId,
    dueAt: d.echeance?.toISOString() ?? null,
    dueAllDay: d.echeance ? d.jourEntier : true,
    sourceUrl: d.lien ?? null,
  };

  if (!existant) {
    const passeDepuis = d.echeance ? (maintenant.getTime() - d.echeance.getTime()) / JOUR_MS : 0;
    const vraiRetard = !d.rendu && ctx.rendusSurClassroom;
    if (passeDepuis > IGNORER_PASSES_DEPUIS_JOURS && !vraiRetard) return 'ignore';
    if (d.rendu && !d.echeance) return 'ignore';
    db.insert(items)
      .values({
        ...champs,
        type: 'devoir',
        source: 'classroom',
        externalId: d.googleId,
        accountId: ctx.accountId,
        status: statut,
        // Déjà rendu à l'import : terminé à l'échéance, pour ne pas encombrer « terminées cette semaine ».
        completedAt: d.rendu ? (d.echeance ?? maintenant).toISOString() : null,
      })
      .run();
    return 'cree';
  }

  if (existant.lockedByUser) return 'verrouille';
  const nouveauStatut = d.rendu
    ? 'termine'
    : existant.status === 'termine'
      ? 'a_faire'
      : existant.status;
  const change =
    existant.title !== champs.title ||
    existant.description !== champs.description ||
    existant.subjectId !== champs.subjectId ||
    existant.dueAt !== champs.dueAt ||
    existant.dueAllDay !== champs.dueAllDay ||
    existant.sourceUrl !== champs.sourceUrl ||
    existant.status !== nouveauStatut;
  if (!change) return 'inchange';
  db.update(items)
    .set({
      ...champs,
      status: nouveauStatut,
      completedAt:
        nouveauStatut === 'termine' ? (existant.completedAt ?? maintenant.toISOString()) : null,
      updatedAt: maintenantIso(),
    })
    .where(eq(items.id, existant.id))
    .run();
  return 'maj';
}

/**
 * Retire les tâches Classroom d'un compte qui ne correspondent plus à un devoir d'un cours suivi
 * (cours décoché, ou devoir supprimé par le prof) — sauf celles que Fares a modifiées —
 * ainsi que les annonces et supports des cours non suivis.
 */
export function nettoyerClassroom(db: Db, accountId: number, devoirsVus: Set<string>): number {
  let retires = 0;
  const taches = db
    .select({ id: items.id, externalId: items.externalId, lockedByUser: items.lockedByUser })
    .from(items)
    .where(and(eq(items.source, 'classroom'), eq(items.accountId, accountId)))
    .all();
  for (const t of taches) {
    if (!t.lockedByUser && t.externalId && !devoirsVus.has(t.externalId)) {
      db.delete(items).where(eq(items.id, t.id)).run();
      retires++;
    }
  }
  const nonSuivis = db
    .select({ id: classroomCourses.id })
    .from(classroomCourses)
    .where(and(eq(classroomCourses.accountId, accountId), eq(classroomCourses.followed, false)))
    .all();
  for (const c of nonSuivis)
    db.delete(classroomPosts).where(eq(classroomPosts.courseId, c.id)).run();
  return retires;
}

// --- Annonces et supports --------------------------------------------------

export function majPost(
  db: Db,
  courseId: number,
  p: {
    googleId: string;
    kind: 'annonce' | 'support';
    title?: string | null;
    text?: string | null;
    link?: string | null;
    postedAt: string;
  },
): void {
  db.insert(classroomPosts)
    .values({ courseId, ...p })
    .onConflictDoUpdate({
      target: [classroomPosts.courseId, classroomPosts.googleId],
      set: { title: p.title ?? null, text: p.text ?? null, link: p.link ?? null },
    })
    .run();
}

// --- État des synchros -----------------------------------------------------

/** Délai avant nouvel essai après `echecs` échecs consécutifs : 15 min, 30, 60… jusqu'à 6 h. */
export function delaiNouvelEssaiMs(echecs: number): number {
  return Math.min(15 * 60_000 * 2 ** Math.max(0, echecs - 1), 6 * 3_600_000);
}

export function syncReussie(db: Db, key: string, label: string, details: string): void {
  const v = {
    label,
    lastSuccessAt: maintenantIso(),
    consecutiveFailures: 0,
    nextRetryAt: null,
    enEchecDepuis: null,
    details,
  };
  db.insert(syncStatus)
    .values({ key, ...v })
    .onConflictDoUpdate({ target: syncStatus.key, set: v })
    .run();
}

/** Passage partiel réussi (import en plusieurs fois) : pas d'erreur, mais pas encore « à jour ». */
export function syncProgres(db: Db, key: string, label: string, details: string): void {
  const v = { label, consecutiveFailures: 0, nextRetryAt: null, enEchecDepuis: null, details };
  db.insert(syncStatus)
    .values({ key, ...v })
    .onConflictDoUpdate({ target: syncStatus.key, set: v })
    .run();
}

/** Date du dernier passage COMPLET réussi d'une synchro, ou null. */
export function dernierSucces(db: Db, key: string): Date | null {
  const s = db.select().from(syncStatus).where(eq(syncStatus.key, key)).get();
  return s?.lastSuccessAt ? new Date(s.lastSuccessAt) : null;
}

export function syncEchouee(db: Db, key: string, label: string, erreur: string): void {
  const avant = db.select().from(syncStatus).where(eq(syncStatus.key, key)).get();
  const echecs = (avant?.consecutiveFailures ?? 0) + 1;
  const v = {
    label,
    lastErrorAt: maintenantIso(),
    lastError: erreur.slice(0, 500),
    consecutiveFailures: echecs,
    nextRetryAt: new Date(Date.now() + delaiNouvelEssaiMs(echecs)).toISOString(),
    enEchecDepuis: avant?.enEchecDepuis ?? maintenantIso(),
  };
  db.insert(syncStatus)
    .values({ key, ...v })
    .onConflictDoUpdate({ target: syncStatus.key, set: v })
    .run();
}

/** Faut-il attendre avant de réessayer (backoff après échecs) ? */
export function syncEnAttente(db: Db, key: string, maintenant: Date = new Date()): boolean {
  const s = db.select().from(syncStatus).where(eq(syncStatus.key, key)).get();
  return Boolean(s?.nextRetryAt && new Date(s.nextRetryAt) > maintenant);
}

export const listerEtatsSync = (db: Db) =>
  db.select().from(syncStatus).orderBy(asc(syncStatus.key)).all();
