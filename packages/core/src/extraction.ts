/**
 * Outils du moteur d'extraction (logique pure, testée) :
 * - résolution de l'échéance rapportée par l'IA en un instant précis ;
 * - ressemblance de titres pour fusionner les infos de plusieurs sources (dédoublonnage).
 */
import { resoudreJourDetaille } from './dates-relatives';
import { type DayKey, addDaysToKey, dayOfWeek, isDayKey, tunisInstantOn } from './time';

export interface EcheanceLue {
  date: string | null;
  heure: string | null;
  jour: string | null;
  proximite: 'hedha' | 'jey' | null;
  decalage_jours: number | null;
  /** Le texte parle de ce jour au passé (« kenet lkhmis hedha »). */
  passe?: boolean | null;
}

const NUMERO_JOUR: Record<string, number> = {
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  dimanche: 7,
};

/**
 * Échéance précise à partir de ce qui est écrit, vu depuis le jour du message.
 * Priorité : date explicite > jour de la semaine (hedha / jey) > décalage (ghodwa…).
 * Sans heure : fin de journée (23:59 à Tunis), marquée « jour entier ».
 */
export function resoudreEcheance(
  e: EcheanceLue | null | undefined,
  jourMessage: DayKey,
): { echeance: Date; jourEntier: boolean; ambigu?: boolean } | null {
  if (!e) return null;
  let jour: DayKey | null = null;
  let ambigu = false;
  // Date écrite ET jour cité qui se contredisent (« mardi 25/11 » alors que le 25 est un mercredi) :
  // le jour cité l'emporte (une faute de frappe sur un nombre est plus fréquente), « à vérifier ».
  const contradiction =
    !!e.date &&
    isDayKey(e.date) &&
    !!e.jour &&
    !!NUMERO_JOUR[e.jour] &&
    dayOfWeek(e.date) !== NUMERO_JOUR[e.jour];
  if (e.date && isDayKey(e.date) && !contradiction) jour = e.date;
  else if (e.jour && NUMERO_JOUR[e.jour]) {
    const r = resoudreJourDetaille(
      jourMessage,
      NUMERO_JOUR[e.jour]!,
      e.proximite ?? 'hedha',
      e.passe === true,
    );
    jour = r.jour;
    ambigu = r.ambigu || contradiction;
  } else if (typeof e.decalage_jours === 'number' && Math.abs(e.decalage_jours) <= 14) {
    jour = addDaysToKey(jourMessage, e.decalage_jours);
  }
  if (!jour) return null;
  const heure = e.heure && /^\d{1,2}:\d{2}$/.test(e.heure) ? e.heure.padStart(5, '0') : null;
  const base = heure
    ? { echeance: tunisInstantOn(jour, heure), jourEntier: false }
    : { echeance: tunisInstantOn(jour, '23:59'), jourEntier: true };
  return ambigu ? { ...base, ambigu } : base;
}

const MOTS_VIDES = new Set(
  'le la les de du des un une et en au aux a pour sur par avec dans mta3 el l d the of to'.split(
    ' ',
  ),
);
const SYNONYMES: Record<string, string> = {
  cr: 'compte',
  rendu: 'compte',
  rapport: 'compte',
  comptes: 'compte',
  tps: 'tp',
  travaux: 'tp',
  pratiques: 'tp',
  mini: 'projet',
  projets: 'projet',
};

/** Mots significatifs d'un titre (minuscules, sans accents, synonymes ramenés, « TP 3 » = « tp3 »). */
export function motsDuTitre(titre: string): Set<string> {
  const t = titre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b(tp|td|ds|atelier|projet|chapitre|n°|no)\s*(\d+)/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ');
  return new Set(
    t
      .split(' ')
      .map((m) => SYNONYMES[m] ?? m)
      .filter((m) => m.length > 1 && !MOTS_VIDES.has(m)),
  );
}

/** Ressemblance de 0 à 1 (indice de Jaccard sur les mots significatifs). */
/** Nature du travail désignée par un mot du titre (atelier, TP, DS, projet…). */
const FAMILLES: Record<string, string> = {
  atelier: 'atelier',
  tp: 'tp',
  td: 'td',
  ds: 'ds',
  examen: 'examen',
  exam: 'examen',
  projet: 'projet',
  mini: 'projet',
  miniprojet: 'projet',
  presentation: 'presentation',
  soutenance: 'presentation',
  oral: 'presentation',
  quiz: 'quiz',
  test: 'quiz',
};

function famillesDe(mots: Set<string>): Set<string> {
  const f = new Set<string>();
  for (const m of mots) {
    const base = m.replace(/\d+$/, '');
    if (FAMILLES[base]) f.add(FAMILLES[base]);
  }
  return f;
}

/**
 * Deux titres qui désignent à l'évidence des travaux différents : natures différentes (atelier
 * et projet, TP et DS…) ou numéros différents (Atelier 2 / Atelier 3, TP2 / TP3).
 */
export function conflitTitres(a: string, b: string): boolean {
  const ma = motsDuTitre(a);
  const mb = motsDuTitre(b);
  const fa = famillesDe(ma);
  const fb = famillesDe(mb);
  if (fa.size && fb.size && ![...fa].some((x) => fb.has(x))) return true;
  const numeros = (s: Set<string>) =>
    [...s].map((m) => /^(?:[a-z]+)?(\d{1,2})$/.exec(m)?.[1]).filter((n): n is string => !!n);
  const na = numeros(ma);
  const nb = numeros(mb);
  return na.length > 0 && nb.length > 0 && !na.some((n) => nb.includes(n));
}

export function ressemblanceTitres(a: string, b: string): number {
  const ma = motsDuTitre(a);
  const mb = motsDuTitre(b);
  if (!ma.size || !mb.size) return 0;
  if (conflitTitres(a, b)) return 0;
  let communs = 0;
  // « TP » sans numéro correspond à « TP2 », « TP3 »… (même mot, numéro en plus).
  const base = (m: string) => m.replace(/\d+$/, '');
  const present = (m: string, autres: Set<string>) =>
    autres.has(m) || (!/\d$/.test(m) && [...autres].some((x) => /\d$/.test(x) && base(x) === m));
  for (const m of ma)
    if (present(m, mb) || [...mb].some((x) => present(x, new Set([m])))) communs++;
  // Deux numéros différents (tp2 / tp3) : ce ne sont pas les mêmes travaux.
  const numeros = (s: Set<string>) => [...s].filter((m) => /^(tp|td|ds)\d+$/.test(m));
  const na = numeros(ma);
  const nb = numeros(mb);
  if (na.length && nb.length && !na.some((n) => nb.includes(n))) return 0;
  return communs / (ma.size + mb.size - communs);
}

/**
 * Identifiants des documents Google cités par un lien dans un texte
 * (Sheets, Docs, Slides, fichiers Drive), sans doublon, dans l'ordre d'apparition.
 */
export function idsDocumentsGoogle(texte: string | null | undefined): string[] {
  if (!texte) return [];
  const motifs = [
    /docs\.google\.com\/(?:spreadsheets|document|presentation|forms)\/d\/([a-zA-Z0-9_-]{20,})/g,
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{20,})/g,
    /drive\.google\.com\/(?:open|uc)\?(?:[^\s]*&)?id=([a-zA-Z0-9_-]{20,})/g,
  ];
  const ids: string[] = [];
  for (const m of motifs)
    for (const r of texte.matchAll(m)) if (r[1] && !ids.includes(r[1])) ids.push(r[1]);
  return ids;
}
