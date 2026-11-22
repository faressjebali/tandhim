/**
 * Tri des tâches « par deadline la plus proche et par importance » (demande de Fares).
 * Règle :
 *  1. les tâches terminées sont exclues ;
 *  2. en retard d'abord ;
 *  3. puis par échéance « effective » : une tâche importante compte comme si elle était due
 *     DECALAGE_IMPORTANCE_JOURS plus tôt, une tâche peu importante autant plus tard ;
 *  4. les tâches sans échéance à la fin, par importance puis par date de création.
 */
import { daysBetween, formatTunis, tunisDayKey } from './time';

export type Importance = 'basse' | 'normale' | 'haute';
export type StatutTache = 'a_faire' | 'en_cours' | 'termine';

export const IMPORTANCE_LABELS: Record<Importance, string> = {
  haute: 'Importante',
  normale: 'Normale',
  basse: 'Peu importante',
};

export const DECALAGE_IMPORTANCE_JOURS = 3;
const JOUR_MS = 86_400_000;
const POIDS: Record<Importance, number> = { haute: -1, normale: 0, basse: 1 };

export interface TacheTriable {
  id: number;
  statut: StatutTache;
  importance: Importance;
  /** Échéance (instant UTC), ou null si pas d'échéance. */
  echeance: Date | null;
  creeLe: Date;
}

export function estEnRetard(t: TacheTriable, maintenant: Date): boolean {
  return t.statut !== 'termine' && t.echeance !== null && t.echeance < maintenant;
}

function echeanceEffective(t: TacheTriable): number {
  return t.echeance!.getTime() + POIDS[t.importance] * DECALAGE_IMPORTANCE_JOURS * JOUR_MS;
}

export function trierTaches<T extends TacheTriable>(taches: T[], maintenant: Date): T[] {
  const ouvertes = taches.filter((t) => t.statut !== 'termine');
  const rang = (t: T) => (estEnRetard(t, maintenant) ? 0 : t.echeance ? 1 : 2);
  return ouvertes.sort((a, b) => {
    const ra = rang(a);
    const rb = rang(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.echeance!.getTime() - b.echeance!.getTime(); // le plus ancien retard d'abord
    if (ra === 1) {
      const d = echeanceEffective(a) - echeanceEffective(b);
      if (d !== 0) return d;
      return POIDS[a.importance] - POIDS[b.importance];
    }
    const d = POIDS[a.importance] - POIDS[b.importance];
    return d !== 0 ? d : a.creeLe.getTime() - b.creeLe.getTime();
  });
}

/** Avancement d'un projet en % (tâches terminées / total), 0 si aucune tâche. */
export function avancement(taches: Pick<TacheTriable, 'statut'>[]): number {
  if (!taches.length) return 0;
  return Math.round((taches.filter((t) => t.statut === 'termine').length / taches.length) * 100);
}

export type Urgence = 'retard' | 'proche' | 'semaine' | 'loin' | 'aucune';

/**
 * Libellé court d'une échéance, vu depuis `maintenant` (heure de Tunis) :
 * « En retard de 2 j », « Aujourd’hui 14:00 », « Demain », « Jeudi », « 3 déc. ».
 */
export function libelleEcheance(
  echeance: Date | null,
  jourEntier: boolean,
  maintenant: Date,
): { texte: string; urgence: Urgence } {
  if (!echeance) return { texte: 'Sans échéance', urgence: 'aucune' };
  const ecart = daysBetween(tunisDayKey(maintenant), tunisDayKey(echeance));
  const heure = jourEntier ? '' : ` ${formatTunis(echeance, 'HH:mm')}`;
  if (echeance < maintenant) {
    return { texte: ecart < 0 ? `En retard de ${-ecart} j` : 'En retard', urgence: 'retard' };
  }
  if (ecart === 0) return { texte: `Aujourd’hui${heure}`, urgence: 'proche' };
  if (ecart === 1) return { texte: `Demain${heure}`, urgence: 'proche' };
  if (ecart < 7) {
    const jour = formatTunis(echeance, 'EEEE');
    return { texte: jour.charAt(0).toUpperCase() + jour.slice(1) + heure, urgence: 'semaine' };
  }
  return { texte: formatTunis(echeance, 'd MMM') + heure, urgence: 'loin' };
}
