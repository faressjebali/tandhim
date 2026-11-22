import 'server-only';
import {
  type AcademicEvent,
  type CalendarData,
  type ChangementSeance,
  type DayKey,
  type Session,
  addDaysToKey,
  daysBetween,
  eventsOn,
  formatDayKey,
  libelleEcheance,
  sessionsOn,
  trierTaches,
} from '@tandhim/core';
import {
  type Projet,
  type SubjectRow,
  type Tache,
  listSubjects,
  listerChangements,
  listerProjets,
  listerTaches,
  loadCalendarData,
} from '@tandhim/db';
import type { JourBande } from '@/components/bande-jours';
import type { TacheVue } from '@/components/tache';
import { getDb } from './db';

export type Matieres = Map<string, SubjectRow>;

export function chargerCalendrier(): CalendarData {
  return loadCalendarData(getDb().db);
}

/** Changements de séance (annulations, reports, en ligne…) qui touchent ces jours. */
export function chargerChangements(du: DayKey, au: DayKey = du): ChangementSeance[] {
  return listerChangements(getDb().db, du, au);
}

export function chargerMatieres(): Matieres {
  return new Map(listSubjects(getDb().db).map((s) => [s.code, s]));
}

/** Prochain jour (après `jour`) qui a au moins une séance, dans la limite de `horizon` jours. */
export function prochainJourDeCours(
  jour: DayKey,
  data: CalendarData,
  horizon = 30,
): { date: DayKey; seances: Session[] } | undefined {
  for (let i = 1; i <= horizon; i++) {
    const date = addDaysToKey(jour, i);
    const seances = sessionsOn(date, data);
    if (seances.length) return { date, seances };
  }
  return undefined;
}

const PERIODES = ['ds', 'examens', 'vacances', 'controle'] as const;

/** Période (DS, examens, vacances, contrôle) en cours ou qui commence dans `horizon` jours. */
export function periodeProche(
  jour: DayKey,
  events: AcademicEvent[],
  horizon = 30,
): { event: AcademicEvent; dans: number } | undefined {
  const enCours = eventsOn(jour, events).find((e) =>
    (PERIODES as readonly string[]).includes(e.kind),
  );
  if (enCours) return { event: enCours, dans: 0 };
  const suivante = events
    .filter((e) => (PERIODES as readonly string[]).includes(e.kind) && e.startDate > jour)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
  if (!suivante) return undefined;
  const dans = daysBetween(jour, suivante.startDate);
  return dans <= horizon ? { event: suivante, dans } : undefined;
}

/** Jours fériés dans les `horizon` prochains jours (aujourd'hui compris). */
export function feriesProches(jour: DayKey, events: AcademicEvent[], horizon = 14) {
  const fin = addDaysToKey(jour, horizon);
  return events.filter(
    (e) =>
      (e.kind === 'ferie' || e.kind === 'ferie_lunaire') && e.endDate >= jour && e.startDate <= fin,
  );
}

/** Tâche prête à afficher (libellé d'échéance relatif à `maintenant`). */
export function versVue(t: Tache, maintenant: Date): TacheVue {
  return {
    id: t.id,
    titre: t.titre,
    faite: t.statut === 'termine',
    importance: t.importance,
    echeance: (() => {
      const e = libelleEcheance(t.echeance, t.echeanceJourEntier, maintenant);
      // Rendu hors Classroom (mail, présentiel) : on ne sait pas si c'est en retard.
      return e.urgence === 'retard' && t.renduIncertain
        ? { texte: 'Échéance passée : rendu ?', urgence: 'semaine' as const }
        : e;
    })(),
    matiere: t.matiere ? { code: t.matiere.code, couleur: t.matiere.couleur } : null,
    projet: t.projet?.titre ?? null,
    aVerifier: t.aVerifier,
    source: t.source,
    lienSource: t.lienSource,
    groupe: t.groupe,
    nouvelleInfo: t.nouvelleInfo,
  };
}

/** Tâches ouvertes triées par échéance et importance (cf. trierTaches). */
export function chargerTachesTriees(maintenant: Date): Tache[] {
  return trierTaches(listerTaches(getDb().db, { ouvertes: true }), maintenant);
}

export function chargerProjets(enCours = true): Projet[] {
  return listerProjets(getDb().db, { enCours });
}

/** Libellé court de l'échéance d'un projet : « dans 12 j », « demain », « en retard ». */
export function echeanceProjet(p: Projet, jour: DayKey): string | undefined {
  if (!p.echeance) return undefined;
  const n = daysBetween(jour, p.echeance);
  if (n < 0) return 'En retard';
  if (n === 0) return 'Aujourd’hui';
  if (n === 1) return 'Demain';
  return n < 14 ? `Dans ${n} j` : formatDayKey(p.echeance, 'd MMM');
}

/** Jours de la bande défilante : de `avant` jours avant à `apres` jours après `centre`. */
export function joursBande(
  centre: DayKey,
  data: CalendarData,
  avant = 21,
  apres = 60,
): JourBande[] {
  return Array.from({ length: avant + apres + 1 }, (_, i) => {
    const date = addDaysToKey(centre, i - avant);
    const abrege = formatDayKey(date, 'EEE').replace('.', '');
    return {
      date,
      abrege: abrege.charAt(0).toUpperCase() + abrege.slice(1, 3),
      numero: formatDayKey(date, 'd'),
      mois: formatDayKey(date, 'MMM').replace('.', ''),
      cours: sessionsOn(date, data).length > 0,
    };
  });
}

/** Listes pour les menus déroulants des formulaires. */
export function optionsFormulaires() {
  const toutes = [...chargerMatieres().values()];
  const matieres = toutes.map((m) => ({ id: m.id, libelle: m.name }));
  const projets = chargerProjets().map((p) => ({ id: p.id, libelle: p.titre }));
  /** Pour l'ajout rapide (« TP ML vendredi 14h ») : codes et alias des matières. */
  const matieresSaisie = toutes.map((m) => ({
    id: m.id,
    code: m.code,
    nom: m.name,
    alias: m.aliases ?? [],
  }));
  return { matieres, projets, matieresSaisie };
}

/** Chemin de retour sûr (interne) passé en paramètre. */
export function retourSur(r: string | undefined, defaut: string): string {
  return r && r.startsWith('/') && !r.startsWith('//') ? r : defaut;
}
