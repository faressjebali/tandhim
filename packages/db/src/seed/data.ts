/**
 * Données de départ (SPEC §7 et §8). Source : emploi du temps S1 RT4/1 et
 * « Calendrier Pédagogique 2026/2027 » (DO-DEF-01, indice 04, édition 09/2026).
 * Les dates marquées ≈ dans la spec sont en statut « a_confirmer ».
 */
import type { AcademicEvent, AcademicWeek, Timetable, WeekLetter } from '@tandhim/core';

export interface SubjectSeed {
  code: string;
  name: string;
  aliases: string[];
  teacher: string;
  /** Couleur pastel « rétro » (palette choisie par Fares le 20/11/2026), texte encre par-dessus. */
  color: string;
  /** Les rendus se font sur Classroom (terminé automatique possible). */
  submissionsViaClassroom: boolean;
  notes?: string;
}

export const SUBJECTS: SubjectSeed[] = [
  {
    code: 'STR',
    name: 'Systèmes temps réel',
    aliases: ['STR', 'temps réel', 'temps reel'],
    teacher: 'Mme Salma Haddad',
    color: '#ff8a75',
    submissionsViaClassroom: true,
  },
  {
    code: 'PRM',
    name: 'Protocoles de réseaux mobiles',
    aliases: ['PRM', 'réseaux mobiles', 'reseaux mobiles'],
    teacher: 'Mme Amel Gharbi',
    color: '#ffc567',
    submissionsViaClassroom: false,
  },
  {
    code: 'THD',
    name: 'Transmission haut débit',
    aliases: ['THD', 'transmission'],
    teacher: 'M. Karim Mansour',
    color: '#ffa64d',
    submissionsViaClassroom: false,
    notes: 'Classroom du compte perso (cours « RT2025 »)',
  },
  {
    code: 'GF',
    name: 'Gestion financière',
    aliases: ['gestion financière', 'gestion financiere', 'GF', 'finance'],
    teacher: 'Mme Nadia Chaabane',
    color: '#4cc38a',
    submissionsViaClassroom: false,
  },
  {
    code: 'PU',
    name: 'Processus unifiés et approches agiles',
    aliases: ['PU', 'agile', 'agiles', 'UP'],
    teacher: 'Mme Rania Jaziri',
    color: '#9be3bf',
    submissionsViaClassroom: false,
  },
  {
    code: 'TNS',
    name: 'Traitement numérique du signal',
    aliases: ['TNS', 'traitement du signal', 'traitement numérique'],
    teacher: 'Mme Leila Ferchichi',
    color: '#5db7f0',
    submissionsViaClassroom: false,
  },
  {
    code: 'ANG',
    name: 'Anglais',
    aliases: ['anglais', 'english', 'ang'],
    teacher: 'Mme Sarah Collins',
    color: '#a8dcf7',
    submissionsViaClassroom: false,
  },
  {
    code: 'COM',
    name: 'Communication',
    aliases: ['communication', 'com'],
    teacher: 'M. Hatem Ayari',
    color: '#9d85f2',
    submissionsViaClassroom: false,
  },
  {
    code: 'ML',
    name: 'Machine Learning',
    aliases: ['ML', 'machine learning'],
    teacher: 'M. Walid Trabelsi',
    color: '#c9b8ff',
    submissionsViaClassroom: false,
    notes: 'Dossier Drive partagé',
  },
  {
    code: 'RHD',
    name: 'Réseaux haut débit et applications',
    aliases: ['RHD', 'réseaux haut débit', 'reseaux haut debit'],
    teacher: 'M. Sami Riahi',
    color: '#fb7da8',
    submissionsViaClassroom: false,
  },
  {
    code: 'DROIT',
    name: 'Droit',
    aliases: ['droit'],
    teacher: 'Mme Ons Mejri',
    color: '#f7bfd6',
    submissionsViaClassroom: false,
  },
  {
    code: 'FW',
    name: 'Frameworks de développement',
    aliases: ['frameworks', 'framework', 'FW'],
    teacher: 'M. Anis Sassi',
    color: '#e3cf9b',
    submissionsViaClassroom: false,
  },
];

export const TIMETABLE_S1: Timetable = {
  label: 'S1 2026/2027 — RT4/1',
  validFrom: '2026-09-01',
  validTo: '2026-12-12',
  slots: [
    {
      dayOfWeek: 1,
      slot: 'C2',
      subjectCode: 'STR',
      teacher: 'Mme Salma Haddad',
      room: 'A5',
      type: 'C',
      weeks: 'all',
    },
    {
      dayOfWeek: 1,
      slot: 'C4',
      subjectCode: 'PRM',
      teacher: 'Mme Amel Gharbi',
      room: 'LI212',
      type: 'TP',
      weeks: 'B',
    },
    {
      dayOfWeek: 2,
      slot: 'C2',
      subjectCode: 'THD',
      teacher: 'M. Karim Mansour',
      room: 'LI173',
      type: 'CI',
      weeks: 'all',
    },
    {
      dayOfWeek: 2,
      slot: 'C3',
      subjectCode: 'GF',
      teacher: 'Mme Nadia Chaabane',
      room: '219',
      type: 'C',
      weeks: 'all',
    },
    {
      dayOfWeek: 3,
      slot: 'C1',
      subjectCode: 'PU',
      teacher: 'Mme Rania Jaziri',
      room: 'A2',
      type: 'C',
      weeks: 'all',
    },
    {
      dayOfWeek: 3,
      slot: 'C2',
      subjectCode: 'PU',
      teacher: 'Mme Rania Jaziri',
      room: 'LI116',
      type: 'TP',
      weeks: 'A',
    },
    {
      dayOfWeek: 3,
      slot: 'C3',
      subjectCode: 'PRM',
      teacher: 'Mme Amel Gharbi',
      room: 'A6',
      type: 'C',
      weeks: 'all',
    },
    {
      dayOfWeek: 4,
      slot: 'C1',
      subjectCode: 'TNS',
      teacher: 'Mme Leila Ferchichi',
      room: 'LI177',
      type: 'TP',
      weeks: 'all',
    },
    {
      dayOfWeek: 4,
      slot: 'C2',
      subjectCode: 'ANG',
      teacher: 'Mme Sarah Collins',
      room: '229',
      type: 'TD',
      weeks: 'all',
    },
    {
      dayOfWeek: 4,
      slot: 'C3',
      subjectCode: 'COM',
      teacher: 'M. Hatem Ayari',
      room: '249',
      type: 'C',
      weeks: 'all',
    },
    {
      dayOfWeek: 4,
      slot: 'C4',
      subjectCode: 'ML',
      teacher: 'M. Walid Trabelsi',
      room: 'A6',
      type: 'C',
      weeks: 'all',
    },
    {
      dayOfWeek: 4,
      slot: 'C5',
      subjectCode: 'ML',
      teacher: 'M. Walid Trabelsi',
      room: 'LI210',
      type: 'TP',
      weeks: 'B',
    },
    {
      dayOfWeek: 5,
      slot: 'C1',
      subjectCode: 'TNS',
      teacher: 'Mme Leila Ferchichi',
      room: 'A2',
      type: 'C',
      weeks: 'all',
    },
    {
      dayOfWeek: 5,
      slot: 'C2',
      subjectCode: 'RHD',
      teacher: 'M. Sami Riahi',
      room: '229',
      type: 'C',
      weeks: 'all',
    },
    {
      dayOfWeek: 5,
      slot: 'C3',
      subjectCode: 'DROIT',
      teacher: 'Mme Ons Mejri',
      room: '239',
      type: 'C',
      weeks: 'all',
    },
    {
      dayOfWeek: 5,
      slot: 'C4',
      subjectCode: 'FW',
      teacher: 'M. Anis Sassi',
      room: 'A6',
      type: 'C',
      weeks: 'all',
    },
    {
      dayOfWeek: 5,
      slot: 'C5',
      subjectCode: 'FW',
      teacher: 'M. Anis Sassi',
      room: 'LI210',
      type: 'TP',
      weeks: 'A',
    },
  ],
};

export const SEMESTERS = [
  { number: 1 as const, academicYear: '2026/2027', startDate: '2026-08-31', endDate: '2027-01-09' },
  { number: 2 as const, academicYear: '2026/2027', startDate: '2027-01-11', endDate: '2027-07-03' },
];

const w = (
  semester: 1 | 2,
  number: number,
  startDate: string,
  letter: WeekLetter,
): AcademicWeek => ({
  semester,
  number,
  startDate,
  letter,
});

/** Semaines de cours (les semaines de DS, vacances et examens n'en font pas partie). */
export const WEEKS: AcademicWeek[] = [
  w(1, 1, '2026-08-31', 'a'),
  w(1, 2, '2026-09-07', 'b'),
  w(1, 3, '2026-09-14', 'a'),
  w(1, 4, '2026-09-21', 'b'),
  w(1, 5, '2026-09-28', 'a'),
  w(1, 6, '2026-10-05', 'b'),
  w(1, 7, '2026-10-12', 'a'),
  w(1, 8, '2026-10-19', 'b'),
  w(1, 9, '2026-10-26', 'a'),
  w(1, 11, '2026-11-09', 'b'),
  w(1, 12, '2026-11-16', 'a'),
  w(1, 13, '2026-11-23', 'b'),
  w(1, 14, '2026-11-30', 'a'),
  w(1, 15, '2026-12-07', 'b'),
  w(2, 1, '2027-01-11', 'a'),
  w(2, 2, '2027-01-18', 'b'),
  w(2, 3, '2027-01-25', 'a'),
  w(2, 4, '2027-02-01', 'b'),
  w(2, 5, '2027-02-08', 'a'),
  w(2, 6, '2027-02-15', 'b'),
  w(2, 7, '2027-02-22', 'a'),
  w(2, 8, '2027-03-01', 'b'),
  w(2, 9, '2027-03-08', 'a'),
  w(2, 11, '2027-04-05', 'b'),
  w(2, 12, '2027-04-12', 'a'),
  w(2, 13, '2027-04-19', 'b'),
  w(2, 14, '2027-04-26', 'a'),
  w(2, 15, '2027-05-03', 'b'),
];

type Ev = Omit<AcademicEvent, 'endDate' | 'status' | 'blocksClasses'> &
  Partial<Pick<AcademicEvent, 'endDate' | 'status' | 'blocksClasses'>>;
const ev = (e: Ev): AcademicEvent => ({
  endDate: e.startDate,
  status: 'confirme',
  blocksClasses: true,
  ...e,
});

export const EVENTS: AcademicEvent[] = [
  // Semestre 1
  ev({ kind: 'ds', title: 'DS semestre 1', startDate: '2026-11-02', endDate: '2026-11-07' }),
  ev({
    kind: 'vacances',
    title: "Vacances d'hiver",
    startDate: '2026-12-14',
    endDate: '2026-12-26',
  }),
  ev({ kind: 'examens', title: 'Examens S1', startDate: '2026-12-28', endDate: '2026-12-31' }),
  ev({ kind: 'examens', title: 'Examens S1', startDate: '2027-01-04', endDate: '2027-01-09' }),
  // Semestre 2
  ev({ kind: 'ds', title: 'DS semestre 2', startDate: '2027-03-15', endDate: '2027-03-20' }),
  ev({
    kind: 'vacances',
    title: 'Vacances de printemps',
    startDate: '2027-03-22',
    endDate: '2027-04-03',
  }),
  ev({ kind: 'arret_cours', title: 'Arrêt des cours', startDate: '2027-05-08' }),
  // Dates confirmées par Fares le 20/11/2026.
  ev({ kind: 'examens', title: 'Examens S2', startDate: '2027-05-13', endDate: '2027-05-15' }),
  ev({ kind: 'examens', title: 'Examens S2', startDate: '2027-05-20', endDate: '2027-05-22' }),
  ev({ kind: 'examens', title: 'Examens S2', startDate: '2027-05-24', endDate: '2027-05-26' }),
  ev({
    kind: 'controle',
    title: 'Session de contrôle',
    startDate: '2027-06-14',
    endDate: '2027-06-19',
  }),
  ev({
    kind: 'controle',
    title: 'Session de contrôle',
    startDate: '2027-06-21',
    endDate: '2027-06-23',
  }),
  // Autres dates (pas de cours bloqués)
  ev({
    kind: 'validation_notes',
    title: 'Validation des notes S1',
    startDate: '2027-02-10',
    endDate: '2027-02-12',
    blocksClasses: false,
  }),
  ev({
    kind: 'deliberation',
    title: 'Délibérations 4ᵉ année',
    startDate: '2027-06-03',
    blocksClasses: false,
  }),
  ev({
    kind: 'deliberation',
    title: 'Délibérations session de contrôle',
    startDate: '2027-06-29',
    endDate: '2027-06-30',
    blocksClasses: false,
  }),
  ev({ kind: 'fete', title: "Fête de fin d'année", startDate: '2027-07-03', blocksClasses: false }),
  // Jours fériés fixes
  ev({ kind: 'ferie', title: "Fête de l'évacuation", startDate: '2026-10-15' }),
  ev({ kind: 'ferie', title: "Jour de l'an", startDate: '2027-01-01' }),
  ev({ kind: 'ferie', title: "Fête de l'indépendance", startDate: '2027-03-20' }),
  ev({ kind: 'ferie', title: 'Journée des martyrs', startDate: '2027-04-09' }),
  ev({ kind: 'ferie', title: 'Fête du travail', startDate: '2027-05-01' }),
  ev({ kind: 'ferie', title: 'Fête de la République', startDate: '2027-07-25' }),
  // Jours fériés lunaires : dates données par Fares le 20/11/2026, restent « à confirmer »
  // (dépendent de l'observation de la lune ; mises à jour par annonce officielle).
  ev({
    kind: 'ferie_lunaire',
    title: 'Férié lunaire',
    startDate: '2027-03-09',
    endDate: '2027-03-10',
    status: 'a_confirmer',
  }),
  ev({
    kind: 'ferie_lunaire',
    title: 'Férié lunaire',
    startDate: '2027-05-17',
    endDate: '2027-05-18',
    status: 'a_confirmer',
  }),
  ev({
    kind: 'ferie_lunaire',
    title: 'Férié lunaire',
    startDate: '2027-06-07',
    status: 'a_confirmer',
  }),
];
