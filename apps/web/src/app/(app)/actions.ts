'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type Importance, type StatutTache, isDayKey } from '@tandhim/core';
import {
  changerStatutProjet,
  changerStatutTache,
  creerProjet,
  appliquerDateConsigne,
  basculerSeanceRevision,
  marquerConsignesVues,
  creerTache,
  fusionnerProjets,
  ignorerChangement,
  modifierProjet,
  type EcheanceTache,
  modifierTache,
  recalculerRevisions,
  reglerRevision,
  retirerProjet,
  validerProjet,
  reporterTache,
  restaurerEcheance,
  supprimerProjet,
  supprimerTache,
} from '@tandhim/db';
import { getDb } from '@/lib/db';

export type EtatFormulaire = { erreur?: string };

const texte = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const entier = (f: FormData, k: string) => {
  const n = Number(f.get(k));
  return Number.isInteger(n) && n > 0 ? n : null;
};
const importance = (f: FormData): Importance => {
  const v = f.get('importance');
  return v === 'haute' || v === 'basse' ? v : 'normale';
};
const typeTache = (f: FormData): 'tache' | 'ds' | 'examen' | undefined => {
  const v = f.get('type');
  return v === 'ds' || v === 'examen' || v === 'tache' ? v : undefined;
};
/** Retour après enregistrement : seulement un chemin interne. */
const retour = (f: FormData, defaut: string) => {
  const r = texte(f, 'retour');
  return r.startsWith('/') && !r.startsWith('//') ? r : defaut;
};

function lireTache(f: FormData) {
  const titre = texte(f, 'titre');
  const jour = texte(f, 'echeanceJour');
  const heure = texte(f, 'echeanceHeure');
  if (!titre) return { erreur: 'Donne un titre à la tâche.' } as const;
  if (jour && !isDayKey(jour)) return { erreur: 'Date d’échéance invalide.' } as const;
  if (heure && !/^\d{2}:\d{2}$/.test(heure)) return { erreur: 'Heure invalide.' } as const;
  if (heure && !jour) return { erreur: 'Choisis un jour pour cette heure.' } as const;
  return {
    tache: {
      titre,
      description: texte(f, 'description') || null,
      echeanceJour: jour || null,
      echeanceHeure: heure || null,
      importance: importance(f),
      matiereId: entier(f, 'matiereId'),
      projetId: entier(f, 'projetId'),
      type: typeTache(f),
    },
  } as const;
}

export async function enregistrerTache(_: EtatFormulaire, f: FormData): Promise<EtatFormulaire> {
  const lu = lireTache(f);
  if ('erreur' in lu) return { erreur: lu.erreur };
  const id = entier(f, 'id');
  const { db } = getDb();
  if (id) modifierTache(db, id, lu.tache);
  else creerTache(db, lu.tache);
  // Une épreuve ajoutée, déplacée ou retirée change le planning de révision.
  recalculerRevisions(db);
  revalidatePath('/', 'layout');
  redirect(retour(f, '/'));
}

/** Kanban : déplacer une tâche dans une autre colonne. */
export async function deplacerTache(id: number, statut: StatutTache): Promise<void> {
  if (!['a_faire', 'en_cours', 'termine'].includes(statut)) return;
  changerStatutTache(getDb().db, id, statut);
  revalidatePath('/', 'layout');
}

export async function basculerTache(id: number, faite: boolean): Promise<void> {
  changerStatutTache(getDb().db, id, faite ? 'termine' : 'a_faire');
  revalidatePath('/', 'layout');
}

/** Glisser à gauche : reporter d'un jour. Renvoie l'échéance d'avant (pour « Annuler »). */
export async function reporterTacheAction(id: number): Promise<EcheanceTache | null> {
  const avant = reporterTache(getDb().db, id, 1);
  revalidatePath('/', 'layout');
  return avant;
}

export async function annulerReport(id: number, avant: EcheanceTache): Promise<void> {
  restaurerEcheance(getDb().db, id, avant);
  revalidatePath('/', 'layout');
}

/** Menu rapide (appui long) : suppression sans changer de page. */
export async function supprimerTacheAction(id: number): Promise<void> {
  supprimerTache(getDb().db, id);
  revalidatePath('/', 'layout');
}

export async function effacerTache(f: FormData): Promise<void> {
  const id = entier(f, 'id');
  if (id) supprimerTache(getDb().db, id);
  revalidatePath('/', 'layout');
  redirect(retour(f, '/a-faire'));
}

export async function enregistrerProjet(_: EtatFormulaire, f: FormData): Promise<EtatFormulaire> {
  const titre = texte(f, 'titre');
  const echeance = texte(f, 'echeance');
  if (!titre) return { erreur: 'Donne un nom au projet.' };
  if (echeance && !isDayKey(echeance)) return { erreur: 'Date d’échéance invalide.' };
  const type = f.get('type') === 'cours' ? 'cours' : 'perso';
  if (type === 'cours' && !entier(f, 'matiereId')) {
    return { erreur: 'Choisis la matière de ce projet de cours.' };
  }
  const projet = {
    titre,
    type,
    matiereId: entier(f, 'matiereId'),
    description: texte(f, 'description') || null,
    echeance: echeance || null,
    couleur: texte(f, 'couleur') || null,
  } as const;
  const id = entier(f, 'id');
  const { db } = getDb();
  const projetId = id ?? creerProjet(db, projet);
  if (id) modifierProjet(db, id, projet);
  revalidatePath('/', 'layout');
  redirect(`/projets/${projetId}`);
}

export async function terminerProjet(f: FormData): Promise<void> {
  const id = entier(f, 'id');
  if (id) changerStatutProjet(getDb().db, id, f.get('rouvrir') ? 'en_cours' : 'termine');
  revalidatePath('/', 'layout');
}

/** Projet proposé par l'IA : validé par Fares. */
export async function validerProjetAction(f: FormData): Promise<void> {
  const id = entier(f, 'id');
  if (id) validerProjet(getDb().db, id);
  revalidatePath('/', 'layout');
}

/** Fusionner ce projet dans un autre : ses tâches y sont déplacées. */
export async function fusionnerProjetAction(f: FormData): Promise<void> {
  const id = entier(f, 'id');
  const cible = entier(f, 'cible');
  if (!id || !cible) return;
  fusionnerProjets(getDb().db, id, cible);
  revalidatePath('/', 'layout');
  redirect(`/projets/${cible}`);
}

/** Supprimer un projet proposé par l'IA : le regroupement disparaît, les tâches restent. */
export async function retirerProjetAction(f: FormData): Promise<void> {
  const id = entier(f, 'id');
  if (id) retirerProjet(getDb().db, id);
  revalidatePath('/', 'layout');
  redirect('/projets');
}

export async function effacerProjet(f: FormData): Promise<void> {
  const id = entier(f, 'id');
  if (id) supprimerProjet(getDb().db, id);
  revalidatePath('/', 'layout');
  redirect('/projets');
}

/** « Ignorer » un changement de séance mal compris : il disparaît et n'est jamais recréé. */
export async function ignorerChangementAction(f: FormData): Promise<void> {
  const id = entier(f, 'id');
  if (id) ignorerChangement(getDb().db, id);
  revalidatePath('/', 'layout');
}

/** Page d'une tâche ouverte : ses nouvelles infos sont vues. */
export async function marquerInfosVues(itemId: number): Promise<void> {
  marquerConsignesVues(getDb().db, itemId);
  revalidatePath('/', 'layout');
}

/** « Appliquer cette date » : la date proposée par une info devient l'échéance. */
export async function appliquerDateAction(f: FormData): Promise<void> {
  const id = entier(f, 'consigne');
  if (!id) return;
  const { db } = getDb();
  appliquerDateConsigne(db, id);
  recalculerRevisions(db);
  revalidatePath('/', 'layout');
}

export async function basculerSeanceRevisionAction(id: number, faite: boolean): Promise<void> {
  basculerSeanceRevision(getDb().db, id, faite);
  revalidatePath('/', 'layout');
}

export async function reglerRevisionAction(f: FormData): Promise<void> {
  const n = (k: string, permis: number[]) => {
    const v = Number(f.get(k));
    return permis.includes(v) ? v : undefined;
  };
  const { db } = getDb();
  reglerRevision(db, {
    joursAvant: n('joursAvant', [7, 10, 14]),
    seancesParEpreuve: n('seancesParEpreuve', [2, 4, 6]),
    dureeMin: n('dureeMin', [60, 90, 120]),
  });
  recalculerRevisions(db);
  revalidatePath('/', 'layout');
}
