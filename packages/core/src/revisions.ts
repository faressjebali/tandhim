/**
 * Planning de révision (SPEC §6.6) : avant chaque épreuve (DS, examen) datée, répartir des
 * séances de révision dans les créneaux libres (hors cours, hors épreuves) des jours précédents.
 * Calcul pur et déterministe : relancé à chaque changement, il redonne le même planning.
 */
import { type CalendarData, sessionsOn } from './calendar';
import { type DayKey, addDaysToKey, dayKeysBetween, tunisDayKey, tunisInstantOn } from './time';

export interface ReglagesRevision {
  /** Nombre de jours avant l'épreuve sur lesquels répartir les séances. */
  joursAvant: number;
  /** Séances par épreuve. */
  seancesParEpreuve: number;
  /** Durée d'une séance, en minutes. */
  dureeMin: number;
}

export const REGLAGES_REVISION_DEFAUT: ReglagesRevision = {
  joursAvant: 10,
  seancesParEpreuve: 4,
  dureeMin: 120,
};

export interface Epreuve {
  id: number;
  matiere: string | null;
  titre: string;
  debut: Date;
}

export interface SeancePlanifiee {
  epreuveId: number;
  debut: Date;
  fin: Date;
}

/** Débuts possibles : le soir après une journée de cours ; matin, après-midi et fin d'après-midi sinon. */
const DEBUTS_JOUR_DE_COURS = ['18:00'];
const DEBUTS_JOUR_LIBRE = ['09:00', '14:00', '16:30'];

const chevauche = (a: { debut: Date; fin: Date }, b: { debut: Date; fin: Date }) =>
  a.debut < b.fin && b.debut < a.fin;

/** Créneaux libres d'un jour (ni cours, ni épreuve), en ordre chronologique. */
export function creneauxLibres(
  jour: DayKey,
  data: CalendarData,
  epreuves: Epreuve[],
  dureeMin: number,
): { debut: Date; fin: Date }[] {
  const cours = sessionsOn(jour, data).map((s) => ({ debut: s.start, fin: s.end }));
  const occupe = [
    ...cours,
    ...epreuves.map((e) => ({ debut: e.debut, fin: new Date(e.debut.getTime() + 3 * 3_600_000) })),
  ];
  const debuts = cours.length ? DEBUTS_JOUR_DE_COURS : DEBUTS_JOUR_LIBRE;
  return debuts
    .map((h) => {
      const debut = tunisInstantOn(jour, h);
      return { debut, fin: new Date(debut.getTime() + dureeMin * 60_000) };
    })
    .filter((c) => !occupe.some((o) => chevauche(c, o)));
}

/**
 * Planifie les séances à partir de `aujourdhui` (jamais dans le passé). Les épreuves les plus
 * proches sont servies d'abord ; pour chacune, les séances sont étalées sur la fenêtre, la
 * dernière la veille ou l'avant-veille. `dejaFaites` = séances déjà faites par épreuve (comptées).
 */
export function planifierRevisions(
  epreuves: Epreuve[],
  data: CalendarData,
  aujourdhui: DayKey,
  maintenant: Date,
  reglages: ReglagesRevision = REGLAGES_REVISION_DEFAUT,
  dejaFaites: Map<number, number> = new Map(),
): SeancePlanifiee[] {
  const prises: SeancePlanifiee[] = [];
  const triees = [...epreuves]
    .filter((e) => e.debut > maintenant)
    .sort((a, b) => a.debut.getTime() - b.debut.getTime());

  for (const e of triees) {
    const besoin = reglages.seancesParEpreuve - (dejaFaites.get(e.id) ?? 0);
    if (besoin <= 0) continue;
    const jourEpreuve = tunisDayKey(e.debut);
    const premier = addDaysToKey(jourEpreuve, -reglages.joursAvant);
    const du = premier > aujourdhui ? premier : aujourdhui;
    const au = addDaysToKey(jourEpreuve, -1);
    if (au < du) continue;
    const candidats = dayKeysBetween(du, au)
      .flatMap((j) => creneauxLibres(j, data, epreuves, reglages.dureeMin))
      .filter((c) => c.debut > maintenant && !prises.some((p) => chevauche(c, p)));
    if (!candidats.length) continue;

    // Étalement : on part de la fin (veille) et on remonte à pas réguliers.
    const n = Math.min(besoin, candidats.length);
    const pas = candidats.length / n;
    for (let k = 0; k < n; k++) {
      const c = candidats[candidats.length - 1 - Math.floor(k * pas)]!;
      prises.push({ epreuveId: e.id, debut: c.debut, fin: c.fin });
    }
  }
  return prises.sort((a, b) => a.debut.getTime() - b.debut.getTime());
}
