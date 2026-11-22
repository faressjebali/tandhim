/**
 * Changements de séance (annulation, report, séance en ligne, rattrapage, changement de salle)
 * appliqués à l'emploi du temps. Les séances sont alignées sur les 5 créneaux INSAT quand c'est
 * possible ; une séance hors créneau (le soir, un dimanche…) garde son heure réelle.
 */
import {
  type CalendarData,
  SLOT_TIMES,
  type Session,
  type SlotCode,
  sessionsOn,
  weekOf,
} from './calendar';
import { type DayKey, formatDayKey, tunisInstantOn } from './time';

export const NATURES_CHANGEMENT = [
  'annulee',
  'reportee',
  'en_ligne',
  'rattrapage',
  'changement_salle',
] as const;
export type NatureChangement = (typeof NATURES_CHANGEMENT)[number];

export interface ChangementSeance {
  id: number;
  matiere: string;
  /** Jour de la séance concernée (pour un rattrapage : jour de la nouvelle séance). */
  jour: DayKey;
  /**
   * Créneau concerné. null avec `heure` = séance hors créneau à cette heure ;
   * null sans heure = toutes les séances de la matière ce jour-là.
   */
  creneau: SlotCode | null;
  /** Heure écrite (HH:MM), utile hors créneau. */
  heure: string | null;
  nature: NatureChangement;
  nouveauJour: DayKey | null;
  nouveauCreneau: SlotCode | null;
  nouvelleHeure: string | null;
  lien: string | null;
  salle: string | null;
  lienSource: string | null;
  aVerifier: boolean;
}

/** Séance telle qu'affichée : éventuellement modifiée, ou ajoutée (rattrapage, report, en ligne). */
export interface SeanceAffichee extends Omit<Session, 'week' | 'slot'> {
  week?: Session['week'];
  /** null = hors des 5 créneaux INSAT (voir `start`). */
  slot: SlotCode | null;
  changement?: ChangementSeance;
  /** Séance déplacée ici depuis ce jour (report) ou ajoutée (rattrapage, séance en ligne en plus). */
  ajoutee?: { nature: 'reportee' | 'rattrapage' | 'en_ligne'; depuis: DayKey | null };
}

const HEURE = /^\d{2}:\d{2}$/;
const DUREE_SEANCE_MIN = 90;

const CRENEAUX = Object.keys(SLOT_TIMES) as SlotCode[];
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** Créneau correspondant à une heure écrite (« 8h » → C1, « 9h30 » → C2) : début le plus proche, à 1 h près. */
export function creneauPourHeure(heure: string | null | undefined): SlotCode | null {
  if (!heure || !/^\d{1,2}:\d{2}$/.test(heure)) return null;
  const m = minutes(heure);
  let meilleur: { c: SlotCode; ecart: number } | null = null;
  for (const c of CRENEAUX) {
    const ecart = Math.abs(minutes(SLOT_TIMES[c].start) - m);
    if (!meilleur || ecart < meilleur.ecart) meilleur = { c, ecart };
  }
  return meilleur && meilleur.ecart <= 60 ? meilleur.c : null;
}

/**
 * Créneau visé par un changement : d'après l'heure si elle est donnée (null si elle tombe hors des
 * créneaux, le soir par exemple), sinon la séance de la matière ce jour-là quand elle est seule.
 */
export function creneauDuChangement(
  jour: DayKey,
  heure: string | null,
  matiere: string,
  data: CalendarData,
): SlotCode | null {
  if (heure && /^\d{1,2}:\d{2}$/.test(heure)) return creneauPourHeure(heure);
  const seances = sessionsOn(jour, data).filter((s) => s.subjectCode === matiere);
  return seances.length === 1 ? seances[0]!.slot : null;
}

function seanceAjoutee(
  jour: DayKey,
  creneau: SlotCode | null,
  heure: string | null,
  modele: Pick<Session, 'subjectCode' | 'type' | 'room' | 'teacher'>,
  data: CalendarData,
): SeanceAffichee | null {
  const debut = creneau ? SLOT_TIMES[creneau].start : heure && HEURE.test(heure) ? heure : null;
  if (!debut) return null;
  const start = tunisInstantOn(jour, debut);
  return {
    ...modele,
    dayOfWeek: 0,
    slot: creneau,
    weeks: 'all',
    date: jour,
    week: weekOf(jour, data.weeks),
    start,
    end: creneau
      ? tunisInstantOn(jour, SLOT_TIMES[creneau].end)
      : new Date(start.getTime() + DUREE_SEANCE_MIN * 60_000),
  };
}

/** Le changement vise-t-il cette séance de l'emploi du temps ? */
const viseLaSeance = (c: ChangementSeance, s: Session) =>
  c.matiere === s.subjectCode &&
  c.jour === s.date &&
  (c.creneau === s.slot || (c.creneau === null && c.heure === null));

/** Séances d'un jour, changements compris (annulées et reportées restent visibles, barrées). */
export function seancesDuJour(
  jour: DayKey,
  data: CalendarData,
  changements: ChangementSeance[],
): SeanceAffichee[] {
  const appliques = new Set<number>();
  const seances: SeanceAffichee[] = sessionsOn(jour, data).map((s) => {
    const c = changements.find((x) => x.nature !== 'rattrapage' && viseLaSeance(x, s));
    if (!c) return s;
    appliques.add(c.id);
    return { ...s, changement: c };
  });

  for (const c of changements) {
    // Séance d'origine (pour reprendre type, salle et enseignant) quand elle existe.
    const origine = sessionsOn(c.jour, data).find((s) => viseLaSeance(c, s));
    const modele = origine ?? { subjectCode: c.matiere, type: 'C' as const, room: '', teacher: '' };
    const avecSalle = { ...modele, room: c.salle ?? modele.room };
    let ajout: SeanceAffichee | null = null;
    if (c.nature === 'rattrapage' && c.jour === jour) {
      const s = seanceAjoutee(jour, c.creneau, c.heure, avecSalle, data);
      if (s) ajout = { ...s, ajoutee: { nature: 'rattrapage', depuis: null } };
    } else if (c.nature === 'reportee' && c.nouveauJour === jour) {
      const s = seanceAjoutee(jour, c.nouveauCreneau, c.nouvelleHeure, avecSalle, data);
      if (s) ajout = { ...s, ajoutee: { nature: 'reportee', depuis: c.jour } };
    } else if (c.nature === 'en_ligne' && c.jour === jour && !appliques.has(c.id)) {
      // Séance en ligne qui ne remplace aucune séance de l'emploi du temps (le soir, en plus…).
      const s = seanceAjoutee(jour, c.creneau, c.heure, modele, data);
      if (s) ajout = { ...s, ajoutee: { nature: 'en_ligne', depuis: null } };
    }
    if (ajout) seances.push({ ...ajout, changement: c });
  }
  return seances.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Séance qui n'aura pas lieu à cet endroit (annulée, ou partie ailleurs). */
export const seanceSupprimee = (s: SeanceAffichee) =>
  !s.ajoutee && (s.changement?.nature === 'annulee' || s.changement?.nature === 'reportee');

const heureDe = (creneau: SlotCode | null, heure: string | null) =>
  creneau ? SLOT_TIMES[creneau].start : heure && HEURE.test(heure) ? heure : null;

const quand = (jour: DayKey, creneau: SlotCode | null, heure: string | null) => {
  const j = formatDayKey(jour, 'EEEE d/MM');
  const h = heureDe(creneau, heure);
  return j.charAt(0).toUpperCase() + j.slice(1) + (h ? ` à ${h}` : '');
};

/** Début de la séance touchée (ou de la nouvelle séance), pour savoir s'il faut prévenir. */
export function instantsDuChangement(c: ChangementSeance): Date[] {
  const debut = (jour: DayKey, creneau: SlotCode | null, heure: string | null) =>
    tunisInstantOn(jour, heureDe(creneau, heure) ?? '08:00');
  const instants = [debut(c.jour, c.creneau, c.heure)];
  if (c.nature === 'reportee' && c.nouveauJour)
    instants.push(debut(c.nouveauJour, c.nouveauCreneau, c.nouvelleHeure));
  return instants;
}

/** Lien cliquable (Meet, Teams…) ou simple code de réunion. */
export const estUnLien = (lien: string | null): lien is string =>
  !!lien && /^https:\/\//.test(lien);

export function texteChangement(c: ChangementSeance): { titre: string; corps: string } {
  const ici = quand(c.jour, c.creneau, c.heure);
  switch (c.nature) {
    case 'annulee':
      return { titre: `${c.matiere} · séance annulée`, corps: ici };
    case 'reportee':
      return {
        titre: `${c.matiere} · séance reportée`,
        corps: `${ici} → ${c.nouveauJour ? quand(c.nouveauJour, c.nouveauCreneau, c.nouvelleHeure).toLowerCase() : 'nouvelle date à venir'}`,
      };
    case 'en_ligne':
      return {
        titre: `${c.matiere} · séance en ligne`,
        corps: estUnLien(c.lien)
          ? `${ici}. Touche pour le lien.`
          : c.lien
            ? `${ici}. Code de la réunion : ${c.lien}`
            : `${ici}. Lien pas encore donné.`,
      };
    case 'rattrapage':
      return {
        titre: `${c.matiere} · séance de rattrapage`,
        corps: c.salle ? `${ici}, salle ${c.salle}` : ici,
      };
    case 'changement_salle':
      return {
        titre: `${c.matiere} · changement de salle`,
        corps: c.salle ? `${ici} : salle ${c.salle}` : ici,
      };
  }
}
