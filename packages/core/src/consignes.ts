/**
 * Consignes cumulées d'une tâche : chaque info reçue (mail, annonce, message…) est gardée avec sa
 * date, sa source et son niveau de confiance. Ordre (décision de Fares, 21/11/2026) :
 *   choix de Fares  >  écrit (mail, Classroom, Drive)  >  Messenger.
 * Une info qui REMPLACE une consigne ne la barre que si elle est de niveau égal ou supérieur ;
 * sinon elle est affichée à côté, « à vérifier ». Une info qui COMPLÈTE s'ajoute simplement.
 */
export const NIVEAUX = ['messenger', 'ecrit', 'fares'] as const;
export type Niveau = (typeof NIVEAUX)[number];
export const rangNiveau = (n: Niveau | null | undefined) => NIVEAUX.indexOf(n ?? 'messenger');

export const ASPECTS = ['date', 'lieu', 'rendu', 'modalites', 'contenu'] as const;
export type Aspect = (typeof ASPECTS)[number];
/** Ce qui mérite une notification quand ça change. */
export const ASPECTS_IMPORTANTS: Aspect[] = ['date', 'lieu', 'rendu', 'modalites'];

export const niveauDeSource = (source: string): Niveau =>
  source === 'messenger' ? 'messenger' : 'ecrit';

export interface ConsigneActive {
  id: number;
  niveau: Niveau;
  aspects: Aspect[];
}

const aspectsDe = (a: Aspect[]) => (a.length ? a : (['contenu'] as Aspect[]));
const seRecoupent = (a: Aspect[], b: Aspect[]) =>
  aspectsDe(a).some((x) => aspectsDe(b).includes(x));

/**
 * Effet d'une nouvelle consigne sur les consignes actives : lesquelles elle barre, et si elle
 * doit être marquée « à vérifier » (elle contredit une consigne plus fiable).
 */
export function effetConsigne(
  actives: ConsigneActive[],
  nouvelle: { niveau: Niveau; aspects: Aspect[]; remplace: boolean },
): { remplacees: number[]; aVerifier: boolean } {
  if (!nouvelle.remplace) return { remplacees: [], aVerifier: false };
  const concernees = actives.filter((c) => seRecoupent(c.aspects, nouvelle.aspects));
  return {
    remplacees: concernees
      .filter((c) => rangNiveau(nouvelle.niveau) >= rangNiveau(c.niveau))
      .map((c) => c.id),
    aVerifier: concernees.some((c) => rangNiveau(nouvelle.niveau) < rangNiveau(c.niveau)),
  };
}

/** Une nouvelle date ne remplace l'échéance que si sa source est au moins aussi fiable. */
export const dateAcceptee = (nouvelle: Niveau, actuelle: Niveau | null | undefined) =>
  rangNiveau(nouvelle) >= rangNiveau(actuelle ?? 'messenger');

/** Faut-il prévenir Fares ? (date changée, lieu, mode de rendu, modalités) */
export function consigneANotifier(aspects: Aspect[], dateChangee: boolean): boolean {
  return dateChangee || aspects.some((a) => a !== 'date' && ASPECTS_IMPORTANTS.includes(a));
}
