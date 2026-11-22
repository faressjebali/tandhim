/**
 * Projets de cours proposés par l'IA : créés seulement pour un vrai projet annoncé par un prof
 * (plusieurs livrables ou étapes), et les tâches suivantes du même projet y sont rangées.
 * Les projets de Fares ne sont jamais modifiés ; ceux qu'il a reliés à une matière (projet de
 * cours) peuvent recevoir des tâches. Valider, fusionner, supprimer : en un geste.
 */
import { ressemblanceTitres } from '@tandhim/core';
import { and, eq, isNull, or } from 'drizzle-orm';
import type { Db } from './client';
import { items, projects } from './schema';

const SEUIL_MEME_PROJET = 0.34;

export interface ProjetAnnonce {
  titre: string;
  /** Nombre de livrables ou d'étapes annoncés : un projet n'est créé qu'à partir de 2. */
  etapes: number;
}

/**
 * Range une tâche dans le projet de cours correspondant (créé si besoin, « à vérifier »).
 * Ne touche jamais une tâche modifiée par Fares ni une tâche déjà rangée ailleurs.
 */
export function rangerDansProjet(
  db: Db,
  itemId: number,
  projet: ProjetAnnonce,
  subjectId: number | null,
): number | null {
  if (!subjectId || projet.etapes < 2 || !projet.titre.trim()) return null;
  const tache = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!tache || tache.lockedByUser || tache.projectId) return null;

  // Projets éligibles de la matière : ceux de l'IA, et ceux que Fares a reliés à la matière.
  const candidats = db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.subjectId, subjectId),
        eq(projects.status, 'en_cours'),
        or(eq(projects.source, 'ia'), eq(projects.kind, 'cours')),
      ),
    )
    .all();
  const meilleur = candidats
    .map((p) => ({ p, score: ressemblanceTitres(p.title, projet.titre) }))
    .sort((a, b) => b.score - a.score)[0];
  let projetId: number;
  if (meilleur && (meilleur.score >= SEUIL_MEME_PROJET || candidats.length === 1)) {
    projetId = meilleur.p.id;
  } else {
    projetId = db
      .insert(projects)
      .values({
        title: projet.titre.trim(),
        kind: 'cours',
        subjectId,
        source: 'ia',
        needsReview: true,
      })
      .returning({ id: projects.id })
      .get().id;
  }
  db.update(items)
    .set({ projectId: projetId, updatedAt: new Date().toISOString() })
    .where(and(eq(items.id, itemId), isNull(items.projectId)))
    .run();
  return projetId;
}

export function validerProjet(db: Db, id: number): void {
  db.update(projects).set({ needsReview: false }).where(eq(projects.id, id)).run();
}

/** Déplace les tâches de `source` dans `cible`, puis supprime `source`. */
export function fusionnerProjets(db: Db, source: number, cible: number): void {
  if (source === cible) return;
  db.transaction((tx) => {
    tx.update(items).set({ projectId: cible }).where(eq(items.projectId, source)).run();
    tx.delete(projects).where(eq(projects.id, source)).run();
  });
}

/** Supprime le regroupement mais GARDE les tâches (elles redeviennent indépendantes). */
export function retirerProjet(db: Db, id: number): void {
  db.transaction((tx) => {
    tx.update(items).set({ projectId: null }).where(eq(items.projectId, id)).run();
    tx.delete(projects).where(eq(projects.id, id)).run();
  });
}
