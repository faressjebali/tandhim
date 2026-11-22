/**
 * Dates relatives en darija, calculées à partir du JOUR DU MESSAGE (jamais du jour de lecture).
 * Règle de Fares (21/11/2026, précisée le 21/11, voir docs/DECISIONS.md) :
 *   - dit du lundi au vendredi, jour encore à venir cette semaine : « hedha » = ce jour-là,
 *     « jey » = celui de la semaine suivante ; le jour même : « hedha » = aujourd'hui ;
 *   - jour déjà passé cette semaine : « hedha » = le jour passé si le verbe est au passé, sinon le
 *     prochain ; « jey » = le prochain (dit vendredi 27 : « lkhmis jey » = jeudi 03/12) ;
 *   - dit le samedi ou le dimanche : la semaine qui vient — « hedha » = le prochain, « jey » =
 *     celui d'après ; sauf « vendredi » dit un samedi : ambigu (à vérifier, le plus proche par défaut).
 */
import { type DayKey, addDaysToKey, dayOfWeek } from './time';

/** Jours de la semaine en darija écrite en lettres latines (1 = lundi … 7 = dimanche). */
export const JOURS_DARIJA: Record<string, number> = {
  lithnin: 1,
  ltnin: 1,
  lethnin: 1,
  ithnin: 1,
  lundi: 1,
  thletha: 2,
  tlatha: 2,
  ethletha: 2,
  ttlatha: 2,
  mardi: 2,
  larb3a: 3,
  lerb3a: 3,
  arb3a: 3,
  mercredi: 3,
  lkhmis: 4,
  khmis: 4,
  elkhmis: 4,
  jeudi: 4,
  ljom3a: 5,
  jom3a: 5,
  jem3a: 5,
  ljem3a: 5,
  vendredi: 5,
  sebt: 6,
  essebt: 6,
  samedi: 6,
  l7ad: 7,
  a7ad: 7,
  la7ad: 7,
  dimanche: 7,
};

export type Proximite = 'hedha' | 'jey';

/** Prochaine occurrence du jour `jourSemaine` à partir de `dateMessage` (le jour même compte). */
function prochaine(dateMessage: DayKey, jourSemaine: number): DayKey {
  const ecart = (jourSemaine - dayOfWeek(dateMessage) + 7) % 7;
  return addDaysToKey(dateMessage, ecart);
}

/** Jour résolu, et s'il est ambigu (à faire confirmer par Fares, source à l'appui). */
export interface JourResolu {
  jour: DayKey;
  ambigu: boolean;
}

export function resoudreJourDetaille(
  dateMessage: DayKey,
  jourSemaine: number,
  proximite: Proximite,
  verbeAuPasse = false,
): JourResolu {
  if (jourSemaine < 1 || jourSemaine > 7)
    throw new Error(`Jour de semaine invalide : ${jourSemaine}`);
  const dit = dayOfWeek(dateMessage);
  const suivant = prochaine(dateMessage, jourSemaine); // le jour même compte
  const plus7 = addDaysToKey(suivant, 7);

  // Samedi ou dimanche : on parle de la semaine qui vient.
  if (dit >= 6) {
    if (dit === 6 && jourSemaine === 5) return { jour: suivant, ambigu: true };
    return { jour: proximite === 'hedha' ? suivant : plus7, ambigu: false };
  }
  // Du lundi au vendredi : jour encore à venir (ou aujourd'hui) dans la semaine.
  if (jourSemaine >= dit) return { jour: proximite === 'hedha' ? suivant : plus7, ambigu: false };
  // Jour déjà passé cette semaine.
  if (proximite === 'hedha' && verbeAuPasse) {
    return { jour: addDaysToKey(dateMessage, jourSemaine - dit), ambigu: false };
  }
  return { jour: suivant, ambigu: false };
}

export function resoudreJour(
  dateMessage: DayKey,
  jourSemaine: number,
  proximite: Proximite,
  verbeAuPasse = false,
): DayKey {
  return resoudreJourDetaille(dateMessage, jourSemaine, proximite, verbeAuPasse).jour;
}

/** « ghodwa » (demain), « lyoum » (aujourd'hui), « ba3d ghodwa » (après-demain), « lbera7 » (hier). */
export const DECALAGES_DARIJA: Record<string, number> = {
  lyoum: 0,
  ghodwa: 1,
  'ba3d ghodwa': 2,
  lbera7: -1,
};

/**
 * « el semaine jeya » = la semaine suivante : lundi de la semaine qui suit celle du message.
 * Confirmé : écrit un samedi ou un dimanche, c'est la semaine du lundi qui suit.
 */
export function lundiSemaineJeya(dateMessage: DayKey): DayKey {
  return addDaysToKey(dateMessage, 8 - dayOfWeek(dateMessage));
}
