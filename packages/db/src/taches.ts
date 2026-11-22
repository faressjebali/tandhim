/**
 * Tâches et projets : lecture et écriture. Les vues (web) passent par ces fonctions.
 */
import {
  type Importance,
  type StatutTache,
  addTunisDays,
  avancement,
  formatTunis,
  tunisDayKey,
  tunisInstantOn,
} from '@tandhim/core';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from './client';
import { itemHistory, items, projects, subjects } from './schema';

export interface Tache {
  id: number;
  titre: string;
  /** Une info reçue que Fares n'a pas encore vue (pastille « Nouvelle info »). */
  nouvelleInfo: boolean;
  groupe: 'RT4' | 'RT4/1' | 'RT4/2';
  /** tache, devoir, tp, ds, examen… (ds et examen = épreuves, préparées par les révisions). */
  type: string;
  description: string | null;
  statut: StatutTache;
  importance: Importance;
  echeance: Date | null;
  echeanceJourEntier: boolean;
  creeLe: Date;
  termineLe: Date | null;
  aVerifier: boolean;
  source: string;
  lienSource: string | null;
  /** Comment le faire (rempli par le moteur IA). */
  modeRendu: string | null;
  commentFaire: string | null;
  confiance: number | null;
  matiere: { id: number; code: string; nom: string; couleur: string } | null;
  projet: { id: number; titre: string } | null;
  /**
   * Devoir Classroom d'une matière où l'on ne rend PAS sur Classroom : une échéance passée
   * ne veut pas dire « en retard » (rendu par mail, en présentiel…), il faut demander.
   */
  renduIncertain: boolean;
}

export interface Projet {
  id: number;
  titre: string;
  type: 'cours' | 'perso';
  description: string | null;
  echeance: string | null;
  couleur: string;
  statut: 'en_cours' | 'termine' | 'archive';
  matiere: { id: number; code: string; nom: string } | null;
  tachesTotal: number;
  tachesFaites: number;
  avancement: number;
  /** Proposé par l'IA ? */
  source: 'manuel' | 'ia';
  aVerifier: boolean;
}

/** Couleur par défaut d'un projet perso sans couleur choisie. */
export const COULEUR_PROJET_PERSO = '#ffc567';

const iso = (d: string | null) => (d ? new Date(d) : null);

export function listerTaches(
  db: Db,
  filtre: { ouvertes?: boolean; projetId?: number; id?: number; tousGroupes?: boolean } = {},
): Tache[] {
  const conditions = [];
  // RT4/2 (l'autre groupe) : stocké mais masqué, sauf accès direct à une tâche.
  if (!filtre.id && !filtre.tousGroupes) conditions.push(ne(items.groupe, 'RT4/2'));
  if (filtre.id) conditions.push(eq(items.id, filtre.id));
  if (filtre.ouvertes) conditions.push(ne(items.status, 'termine'));
  if (filtre.projetId) conditions.push(eq(items.projectId, filtre.projetId));
  const rows = db
    .select({
      item: items,
      subject: {
        id: subjects.id,
        code: subjects.code,
        name: subjects.name,
        color: subjects.color,
        viaClassroom: subjects.submissionsViaClassroom,
      },
      project: { id: projects.id, title: projects.title },
      nouvelleInfo: sql<number>`exists(select 1 from consignes c where c.item_id = ${items.id} and c.vue = 0)`,
    })
    .from(items)
    .leftJoin(subjects, eq(items.subjectId, subjects.id))
    .leftJoin(projects, eq(items.projectId, projects.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${items.dueAt} is null`, asc(items.dueAt), asc(items.id))
    .all();
  return rows.map(({ item, subject, project, nouvelleInfo }) => ({
    id: item.id,
    titre: item.title,
    nouvelleInfo: Boolean(nouvelleInfo),
    groupe: item.groupe,
    type: item.type,
    description: item.description,
    statut: item.status,
    importance: item.importance,
    echeance: iso(item.dueAt),
    echeanceJourEntier: item.dueAllDay,
    creeLe: new Date(item.createdAt),
    termineLe: iso(item.completedAt),
    aVerifier: item.needsReview,
    source: item.source,
    lienSource: item.sourceUrl,
    modeRendu: item.howMode,
    commentFaire: item.howTo,
    confiance: item.confidence,
    matiere: subject?.id
      ? { id: subject.id, code: subject.code!, nom: subject.name!, couleur: subject.color! }
      : null,
    projet: project?.id ? { id: project.id, titre: project.title! } : null,
    renduIncertain: item.source === 'classroom' && !subject?.viaClassroom,
  }));
}

export function listerProjets(db: Db, filtre: { enCours?: boolean; id?: number } = {}): Projet[] {
  const rows = db
    .select({
      project: projects,
      subject: { id: subjects.id, code: subjects.code, name: subjects.name, color: subjects.color },
    })
    .from(projects)
    .leftJoin(subjects, eq(projects.subjectId, subjects.id))
    .where(
      filtre.id
        ? eq(projects.id, filtre.id)
        : filtre.enCours
          ? eq(projects.status, 'en_cours')
          : undefined,
    )
    // Projets avec échéance d'abord (la plus proche en premier), puis les autres.
    .orderBy(sql`${projects.deadlineDate} is null`, asc(projects.deadlineDate), asc(projects.id))
    .all();
  const ids = rows.map((r) => r.project.id);
  const statuts = ids.length
    ? db
        .select({ projectId: items.projectId, status: items.status })
        .from(items)
        .where(inArray(items.projectId, ids))
        .all()
    : [];
  return rows.map(({ project, subject }) => {
    const taches = statuts.filter((s) => s.projectId === project.id);
    return {
      id: project.id,
      titre: project.title,
      type: project.kind,
      description: project.description,
      echeance: project.deadlineDate,
      couleur: project.color ?? subject?.color ?? COULEUR_PROJET_PERSO,
      statut: project.status,
      matiere: subject?.id ? { id: subject.id, code: subject.code!, nom: subject.name! } : null,
      source: project.source,
      aVerifier: project.needsReview,
      tachesTotal: taches.length,
      tachesFaites: taches.filter((t) => t.status === 'termine').length,
      avancement: avancement(taches.map((t) => ({ statut: t.status }))),
    };
  });
}

export interface NouvelleTache {
  titre: string;
  description?: string | null;
  /** Jour d'échéance (AAAA-MM-JJ, Tunis) et heure optionnelle (HH:MM). */
  echeanceJour?: string | null;
  echeanceHeure?: string | null;
  importance?: Importance;
  matiereId?: number | null;
  projetId?: number | null;
  /** Épreuve (DS, examen) ou tâche ordinaire. */
  type?: 'tache' | 'ds' | 'examen';
}

function echeance(jour?: string | null, heure?: string | null) {
  if (!jour) return { dueAt: null, dueAllDay: true };
  return heure
    ? { dueAt: tunisInstantOn(jour, heure).toISOString(), dueAllDay: false }
    : { dueAt: tunisInstantOn(jour, '23:59').toISOString(), dueAllDay: true };
}

export function creerTache(db: Db, t: NouvelleTache): number {
  const r = db
    .insert(items)
    .values({
      title: t.titre.trim(),
      description: t.description?.trim() || null,
      importance: t.importance ?? 'normale',
      subjectId: t.matiereId ?? null,
      projectId: t.projetId ?? null,
      type: t.type === 'ds' || t.type === 'examen' ? t.type : t.projetId ? 'projet' : 'tache',
      source: 'manuel',
      lockedByUser: true,
      ...echeance(t.echeanceJour, t.echeanceHeure),
    })
    .returning({ id: items.id })
    .get();
  return r.id;
}

export function modifierTache(db: Db, id: number, t: NouvelleTache): void {
  // Type : marquer comme épreuve, ou retirer ce marquage ; les autres types (devoir, tp…) restent.
  const actuel = db.select({ type: items.type }).from(items).where(eq(items.id, id)).get()?.type;
  const epreuve = (x: string | undefined) => x === 'ds' || x === 'examen';
  const type =
    t.type && epreuve(t.type)
      ? t.type
      : t.type === 'tache' && epreuve(actuel)
        ? t.projetId
          ? 'projet'
          : 'tache'
        : undefined;
  db.update(items)
    .set({
      title: t.titre.trim(),
      description: t.description?.trim() || null,
      importance: t.importance ?? 'normale',
      subjectId: t.matiereId ?? null,
      projectId: t.projetId ?? null,
      ...echeance(t.echeanceJour, t.echeanceHeure),
      ...(type ? { type } : {}),
      // Une correction manuelle n'est jamais écrasée par une synchro (règle du projet).
      lockedByUser: true,
      needsReview: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(items.id, id))
    .run();
}

export function changerStatutTache(db: Db, id: number, statut: StatutTache): void {
  const maintenant = new Date().toISOString();
  db.update(items)
    .set({
      status: statut,
      completedAt: statut === 'termine' ? maintenant : null,
      lockedByUser: true,
      updatedAt: maintenant,
    })
    .where(eq(items.id, id))
    .run();
}

export interface EcheanceTache {
  dueAt: string | null;
  dueAllDay: boolean;
}

/**
 * Reporte une tâche de `jours` jours (geste « glisser à gauche »). Sans échéance : demain, jour
 * entier. Renvoie l'échéance d'avant, pour pouvoir annuler.
 */
export function reporterTache(
  db: Db,
  id: number,
  jours = 1,
  maintenant: Date = new Date(),
): EcheanceTache | null {
  const t = db
    .select({ dueAt: items.dueAt, dueAllDay: items.dueAllDay })
    .from(items)
    .where(eq(items.id, id))
    .get();
  if (!t) return null;
  // Une échéance déjà passée est reportée à partir d'aujourd'hui, pas de sa date d'origine.
  const base = t.dueAt && new Date(t.dueAt) > maintenant ? new Date(t.dueAt) : null;
  const jour = tunisDayKey(addTunisDays(base ?? maintenant, jours));
  const heure = base && !t.dueAllDay ? formatTunis(base, 'HH:mm') : null;
  const passee = t.dueAt && !base && !t.dueAllDay ? formatTunis(new Date(t.dueAt), 'HH:mm') : null;
  const dueAt = tunisInstantOn(jour, heure ?? passee ?? '23:59').toISOString();
  db.update(items)
    .set({
      dueAt,
      dueAllDay: !(heure ?? passee),
      lockedByUser: true,
      updatedAt: maintenant.toISOString(),
    })
    .where(eq(items.id, id))
    .run();
  db.insert(itemHistory)
    .values({ itemId: id, field: 'dueAt', oldValue: t.dueAt, newValue: dueAt })
    .run();
  return t;
}

/** Remet l'échéance d'avant (bouton « Annuler »). */
export function restaurerEcheance(db: Db, id: number, e: EcheanceTache): void {
  db.update(items)
    .set({ dueAt: e.dueAt, dueAllDay: e.dueAllDay, updatedAt: new Date().toISOString() })
    .where(eq(items.id, id))
    .run();
}

export function supprimerTache(db: Db, id: number): void {
  db.delete(items).where(eq(items.id, id)).run();
}

export interface NouveauProjet {
  titre: string;
  type: 'cours' | 'perso';
  matiereId?: number | null;
  description?: string | null;
  echeance?: string | null;
  couleur?: string | null;
}

export function creerProjet(db: Db, p: NouveauProjet): number {
  return db
    .insert(projects)
    .values({
      title: p.titre.trim(),
      kind: p.type,
      subjectId: p.type === 'cours' ? (p.matiereId ?? null) : null,
      description: p.description?.trim() || null,
      deadlineDate: p.echeance || null,
      color: p.type === 'perso' ? (p.couleur ?? COULEUR_PROJET_PERSO) : null,
    })
    .returning({ id: projects.id })
    .get().id;
}

export function modifierProjet(
  db: Db,
  id: number,
  p: NouveauProjet & { statut?: Projet['statut'] },
): void {
  db.update(projects)
    .set({
      title: p.titre.trim(),
      kind: p.type,
      subjectId: p.type === 'cours' ? (p.matiereId ?? null) : null,
      description: p.description?.trim() || null,
      deadlineDate: p.echeance || null,
      color: p.type === 'perso' ? (p.couleur ?? COULEUR_PROJET_PERSO) : null,
      ...(p.statut ? { status: p.statut } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, id))
    .run();
}

export function changerStatutProjet(db: Db, id: number, statut: Projet['statut']): void {
  db.update(projects)
    .set({ status: statut, updatedAt: new Date().toISOString() })
    .where(eq(projects.id, id))
    .run();
}

export function supprimerProjet(db: Db, id: number): void {
  db.delete(projects).where(eq(projects.id, id)).run();
}

export const trouverTache = (db: Db, id: number) => listerTaches(db, { id })[0];
export const trouverProjet = (db: Db, id: number) => listerProjets(db, { id })[0];
