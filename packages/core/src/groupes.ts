/**
 * Groupes de la filière : les profs et la direction écrivent souvent à toute la RT4 en
 * précisant le groupe (« RT4/1 validation le 12, RT4/2 le 13 »). Fares est en RT4/1 :
 * on affiche RT4 et RT4/1 ; les éléments RT4/2 sont stockés mais masqués.
 */
export const GROUPES = ['RT4', 'RT4/1', 'RT4/2'] as const;
export type Groupe = (typeof GROUPES)[number];

export const GROUPE_DE_FARES: Groupe = 'RT4/1';
export const GROUPES_VISIBLES: Groupe[] = ['RT4', 'RT4/1'];

export const estVisible = (g: string | null | undefined) => g !== 'RT4/2';

export function normaliserGroupe(g: string | null | undefined): Groupe {
  return (GROUPES as readonly string[]).includes(g ?? '') ? (g as Groupe) : 'RT4';
}

/**
 * Une info d'un groupe peut-elle compléter une tâche existante ? Même groupe ; ou tâche
 * « RT4 » (toute la filière) précisée pour RT4/1. Jamais une tâche RT4 ou RT4/1 vers RT4/2 :
 * une date du groupe 2 ne doit pas déplacer celle de Fares.
 */
export function groupesCompatibles(tache: string, element: string): boolean {
  return tache === element || (tache === 'RT4' && element === 'RT4/1');
}
