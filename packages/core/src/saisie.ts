/**
 * Ajout rapide en langage naturel : « TP ML vendredi 14h », « CR TNS demain », « rendu PRM le 3/12 ».
 * Analyse locale (sans IA) : matière, jour, heure, importance. Le titre reste tel que tapé.
 */
import { DECALAGES_DARIJA, JOURS_DARIJA, lundiSemaineJeya, resoudreJour } from './dates-relatives';
import { type DayKey, addDaysToKey, isDayKey, parseDayKey } from './time';

export interface MatiereSaisie {
  id: number;
  code: string;
  nom: string;
  alias: string[];
}

export interface SaisieAnalysee {
  jour: DayKey | null;
  heure: string | null;
  matiereId: number | null;
  importance: 'haute' | null;
}

const MOIS: Record<string, number> = {
  janvier: 1,
  janv: 1,
  fevrier: 2,
  fevr: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};

const ABREVIATIONS_JOURS: Record<string, number> = {
  lun: 1,
  mar: 2,
  mer: 3,
  jeu: 4,
  ven: 5,
  sam: 6,
  dim: 7,
};

/** Minuscules, sans accents ni apostrophes typographiques. */
const normaliser = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');

const deuxChiffres = (n: number) => String(n).padStart(2, '0');

/** Année scolaire 2026/2027 : de septembre à décembre → année de début, sinon l'année suivante. */
function jourDate(jour: number, mois: number, aujourdhui: DayKey): DayKey | null {
  const { year, month } = parseDayKey(aujourdhui);
  const debutAnnee = month >= 9 ? year : year - 1;
  const annee = mois >= 9 ? debutAnnee : debutAnnee + 1;
  const cle = `${annee}-${deuxChiffres(mois)}-${deuxChiffres(jour)}`;
  return isDayKey(cle) ? cle : null;
}

function trouverJour(t: string, aujourdhui: DayKey): DayKey | null {
  // Date écrite : 26/11, 26-11, 26.11 (année éventuelle ignorée), « 26 novembre », « le 26 ».
  const num = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?\b/.exec(t);
  if (num) return jourDate(Number(num[1]), Number(num[2]), aujourdhui);
  const enLettres = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${Object.keys(MOIS).join('|')})\\b`).exec(
    t,
  );
  if (enLettres) return jourDate(Number(enLettres[1]), MOIS[enLettres[2]!]!, aujourdhui);

  for (const [mot, decalage] of [
    ['apres-demain', 2],
    ['apres demain', 2],
    ['aujourd hui', 0],
    ['auj', 0],
    ['ce soir', 0],
    ['demain', 1],
    ...Object.entries(DECALAGES_DARIJA),
  ] as const) {
    if (new RegExp(`\\b${mot}\\b`).test(t)) return addDaysToKey(aujourdhui, decalage);
  }

  const jours = { ...JOURS_DARIJA, ...ABREVIATIONS_JOURS };
  const nomJour = new RegExp(`\\b(${Object.keys(jours).join('|')})\\b(\\s+(?:jey|jeya))?`).exec(t);
  if (nomJour) {
    // « ljom3a jey » = celui de la semaine suivante (règle « jey » de Fares) ; « vendredi » ou
    // « vendredi prochain » = le prochain vendredi (sens courant en français).
    return resoudreJour(aujourdhui, jours[nomJour[1]!]!, nomJour[2] ? 'jey' : 'hedha');
  }
  const leJour = /\ble\s+(\d{1,2})\b(?!\s*h)/.exec(t);
  if (leJour) {
    const { month } = parseDayKey(aujourdhui);
    const n = Number(leJour[1]);
    let cle = jourDate(n, month, aujourdhui);
    // « le 3 » écrit le 21 : le mois suivant.
    if (cle && cle < aujourdhui) cle = jourDate(n, (month % 12) + 1, aujourdhui);
    return cle;
  }
  if (/\b(semaine prochaine|semaine jeya|el semaine jeya)\b/.test(t)) {
    return lundiSemaineJeya(aujourdhui);
  }
  return null;
}

function trouverHeure(t: string): string | null {
  const m = /\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?\b/.exec(t);
  if (!m) return null;
  return `${deuxChiffres(Number(m[1]))}:${m[2] ?? '00'}`;
}

function trouverMatiere(t: string, matieres: MatiereSaisie[]): number | null {
  const contient = (mot: string) => {
    const m = normaliser(mot).trim();
    return (
      m.length >= 2 &&
      new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(t)
    );
  };
  // Code d'abord (« ML », « TNS »), puis alias et nom complet.
  return (
    matieres.find((m) => contient(m.code))?.id ??
    matieres.find((m) => m.alias.some(contient) || contient(m.nom))?.id ??
    null
  );
}

export function analyserSaisie(
  texte: string,
  aujourdhui: DayKey,
  matieres: MatiereSaisie[],
): SaisieAnalysee {
  const t = normaliser(texte);
  return {
    jour: trouverJour(t, aujourdhui),
    heure: trouverHeure(t),
    matiereId: trouverMatiere(t, matieres),
    importance: /\b(urgent|urgente|important|importante)\b|!/.test(t) ? 'haute' : null,
  };
}
