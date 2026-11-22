/**
 * Garde-fous du moteur IA, appliqués par le CODE après la réponse du modèle (testés, sans requête
 * en plus). Mesurés par `pnpm test:ai` : ils visent les erreurs récurrentes du jeu de test.
 *
 *  - Une question ou un sondage encore ouvert n'est jamais une décision → simple info.
 *  - « 2e groupe : présentiel comme d'habitude » n'est pas un changement de séance → ignoré.
 *  - Une date corrigée plus loin dans la conversation (« ghalt, c'est le 10 ») → date corrigée.
 */
import { type EcheanceLue, resoudreEcheance } from './extraction';
import { type DayKey, isDayKey, tunisDayKey } from './time';

export interface ElementGarde {
  type: string;
  citation?: string | null;
  titre?: string | null;
  confiance?: number;
  seance?: { nature?: string | null } | null;
}

const normaliser = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const estSeance = (type: string) => type === 'changement_seance' || type === 'seance_en_ligne';

/** Lignes du texte source qui contiennent la citation de l'élément. */
function lignesDeLaCitation(citation: string, texte: string): string[] {
  const c = normaliser(citation).slice(0, 60);
  if (c.length < 6) return [];
  return texte.split('\n').filter((l) => normaliser(l).includes(c));
}

const SONDAGE_OUVERT = /lance un sondage|sondage encore ouvert/i;
const SANS_CHANGEMENT =
  /comme d.?habitude|comme prevu|comme d.?hab|pas de changement|normalement|kima (dima|el aada)|presentiel/;
const VRAI_CHANGEMENT = /en ligne|annul|report|rattrap|salle|meet|teams|zoom|online/;

export type Verdict = 'garder' | 'info' | 'ignorer';

/**
 * Que faire d'un élément « changement de séance » ou « séance en ligne » proposé par l'IA ?
 * - `info` : il vient d'un sondage encore ouvert ou d'une question (« … ? ») : pas une décision ;
 * - `ignorer` : il décrit une séance qui ne change pas (« présentiel comme d'habitude ») ;
 * - `garder` sinon.
 */
export function verdictSeance(el: ElementGarde, texteSource: string): Verdict {
  if (!estSeance(el.type)) return 'garder';
  const citation = el.citation ?? '';
  const lignes = lignesDeLaCitation(citation, texteSource);
  if (lignes.some((l) => SONDAGE_OUVERT.test(l))) return 'info';
  if (/\?\s*$/.test(citation.trim())) return 'info';
  const c = normaliser(`${citation} ${el.titre ?? ''}`);
  if (
    el.seance?.nature !== 'annulee' &&
    SANS_CHANGEMENT.test(c) &&
    !VRAI_CHANGEMENT.test(normaliser(citation))
  )
    return 'ignorer';
  return 'garder';
}

const CORRECTION = /ghlott|ghalt|ghalta|pardon|correction|je me suis trompe|erreur/;
/** Ce qui suit ces mots est la valeur FAUSSE (« ghalt ktbt 11 », « et pas le 11 », « au lieu du 11 »). */
const MARQUEUR_FAUX = /ghlott|ghalt|ghalta|ktbt|ecrit|pas le|au lieu d|mouch|mech/;

/**
 * Jour corrigé plus loin dans la conversation : une ligne de correction qui cite le bon jour AVANT
 * le marqueur d'erreur et le jour faux APRÈS (« jeudi le 10, ghalt ktbt 11 »). Si l'IA a retenu
 * le jour faux, il est remplacé par le bon (à 7 jours près) ; si elle a retenu le bon, rien ne change.
 */
export function jourCorrige(jour: DayKey, texteSource: string): DayKey | null {
  if (!isDayKey(jour)) return null;
  const numero = Number(jour.slice(8, 10));
  for (const ligne of texteSource.split('\n')) {
    const l = normaliser(ligne);
    if (!CORRECTION.test(l)) continue;
    const marqueur = MARQUEUR_FAUX.exec(l);
    if (!marqueur) continue;
    const nombres = (t: string) =>
      [...t.matchAll(/(?<![\d/:h])(\d{1,2})(?![\d:h])/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n >= 1 && n <= 31);
    const avant = [...new Set(nombres(l.slice(0, marqueur.index)))];
    const apres = nombres(l.slice(marqueur.index));
    if (!apres.includes(numero) || avant.includes(numero)) continue;
    const bons = avant.filter((n) => Math.abs(n - numero) <= 7);
    if (bons.length !== 1) continue;
    return `${jour.slice(0, 8)}${String(bons[0]).padStart(2, '0')}` as DayKey;
  }
  return null;
}

type AvecDates = ElementGarde & {
  echeance?: EcheanceLue | null;
  seance?: { nature?: string | null; date?: EcheanceLue | null } | null;
};

/**
 * Applique tous les garde-fous à un élément proposé par l'IA : `null` = à ignorer ; sinon
 * l'élément, éventuellement ramené à une simple info ou avec sa date corrigée (et sa confiance
 * baissée, pour le badge « à vérifier »).
 */
export function appliquerGardeFous<T extends AvecDates>(
  el: T,
  texteSource: string,
  jourMessage: DayKey,
): T | null {
  const verdict = verdictSeance(el, texteSource);
  if (verdict === 'ignorer') return null;
  let r: T = verdict === 'info' ? { ...el, type: 'info_prof' } : el;
  const corriger = (e: EcheanceLue | null | undefined): EcheanceLue | null | undefined => {
    const res = resoudreEcheance(e, jourMessage);
    if (!e || !res) return e;
    const nouveau = jourCorrige(tunisDayKey(res.echeance), texteSource);
    return nouveau ? { ...e, date: nouveau, jour: null, proximite: null, decalage_jours: null } : e;
  };
  const echeance = corriger(r.echeance);
  const date = corriger(r.seance?.date);
  if (echeance !== r.echeance || date !== r.seance?.date) {
    r = {
      ...r,
      echeance,
      ...(r.seance ? { seance: { ...r.seance, date } } : {}),
      confiance: Math.min(r.confiance ?? 1, 0.5),
    };
  }
  return r;
}
