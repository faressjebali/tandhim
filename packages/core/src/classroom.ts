/**
 * Classroom → Tandhim : logique pure (sans appel réseau), testée.
 * Les types ci-dessous reprennent seulement les champs utiles de l'API Classroom v1.
 */
import { formatTunis } from './time';

export interface DateClassroom {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}
export interface HeureClassroom {
  hours?: number | null;
  minutes?: number | null;
}

/** États de rendu de l'API : NEW, CREATED, TURNED_IN, RETURNED, RECLAIMED_BY_STUDENT. */
export type EtatRendu = string | null | undefined;

/** Échéance d'un devoir (dueDate + dueTime sont en UTC dans l'API). */
export function echeanceClassroom(
  date: DateClassroom | null | undefined,
  heure: HeureClassroom | null | undefined,
): { echeance: Date; jourEntier: boolean } | null {
  if (!date?.year || !date.month || !date.day) return null;
  const echeance = new Date(
    Date.UTC(date.year, date.month - 1, date.day, heure?.hours ?? 0, heure?.minutes ?? 0),
  );
  // « Avant 23:59 » (réglage par défaut de Classroom) = toute la journée, à l'heure de Tunis.
  const jourEntier = formatTunis(echeance, 'HH:mm') === '23:59';
  return { echeance, jourEntier };
}

export function estRendu(etat: EtatRendu): boolean {
  return etat === 'TURNED_IN' || etat === 'RETURNED';
}

const sansAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export interface MatiereRapprochable {
  id: number;
  code: string;
  name: string;
  aliases: string[];
}

/**
 * Matière correspondant au nom d'un cours Classroom (ex. « STR-2026 », « Cours Framework RT4 26 27 »),
 * ou null si aucune ne correspond clairement. Les codes courts (STR, ML…) doivent être un mot entier.
 */
export function rapprocherMatiere<M extends MatiereRapprochable>(
  nomCours: string,
  matieres: M[],
): M | null {
  const nom = ` ${sansAccents(nomCours).replace(/[^a-z0-9]+/g, ' ')} `;
  let meilleure: { m: M; score: number } | null = null;
  for (const m of matieres) {
    for (const terme of [m.name, m.code, ...m.aliases]) {
      const t = sansAccents(terme)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (t.length < 2) continue;
      const trouve = nom.includes(` ${t} `) || (t.length >= 6 && nom.includes(t));
      if (trouve && (!meilleure || t.length > meilleure.score)) meilleure = { m, score: t.length };
    }
  }
  return meilleure?.m ?? null;
}
