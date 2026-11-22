/**
 * Schéma de la réponse attendue de Gemini (sortie JSON structurée, revalidée par zod).
 * Les dates relatives ne sont PAS calculées par l'IA : elle rapporte ce qui est écrit,
 * le code (@tandhim/core) calcule la date à partir du jour du message.
 */
import { z } from 'zod';

export const JOURS = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const;

export const echeanceSchema = z
  .object({
    date: z
      .string()
      .nullable()
      .describe('Date écrite explicitement, au format AAAA-MM-JJ, sinon null.'),
    heure: z
      .string()
      .nullable()
      .describe('Heure limite au format HH:MM si elle est donnée, sinon null.'),
    jour: z
      .enum(JOURS)
      .nullable()
      .describe('Jour de la semaine cité sans date (ex. « lkhmis » → jeudi), sinon null.'),
    proximite: z
      .enum(['hedha', 'jey'])
      .nullable()
      .describe(
        '« hedha » = le prochain ; « jey » = celui d’après. Null si non précisé (= hedha).',
      ),
    decalage_jours: z
      .number()
      .int()
      .nullable()
      .describe('Pour « lyoum » = 0, « ghodwa » = 1, « ba3d ghodwa » = 2. Sinon null.'),
    passe: z
      .boolean()
      .nullable()
      .describe(
        'Vrai si le texte parle de ce jour au PASSÉ (verbe au passé : « kenet lkhmis hedha »). Sinon null.',
      ),
    prochaine_seance: z
      .boolean()
      .nullable()
      .describe(
        'Vrai si c’est « pour la prochaine séance » / « à préparer pour en discuter en séance », sans date. Sinon null.',
      ),
  })
  .describe('Ce qui est ÉCRIT dans le texte : ne calcule pas de date toi-même.');

export const TYPES_ELEMENT = [
  'devoir',
  'tp',
  'compte_rendu',
  'projet',
  'ds',
  'examen',
  'revision',
  'seance_en_ligne',
  'changement_seance',
  'annonce_importante',
  'info_prof',
  'rendu_effectue',
] as const;

export const elementSchema = z.object({
  type: z.enum(TYPES_ELEMENT),
  matiere: z
    .string()
    .nullable()
    .describe('Code de la matière (liste fournie), ou null si inconnue.'),
  titre: z.string().describe('Titre court de la tâche, ex. « Compte rendu TP3 ».'),
  quoi: z.string().describe('Ce qu’il faut faire, en une ou deux phrases, en français.'),
  comment_mode: z
    .enum(['mail', 'classroom', 'presentiel', 'validation', 'en_ligne', 'autre', 'inconnu'])
    .describe('Comment rendre ou faire : par mail, sur Classroom, en présentiel…'),
  comment_details: z
    .string()
    .nullable()
    .describe('Précisions utiles : destinataire (adresse), format, fichiers à joindre, lien.'),
  echeance: echeanceSchema.nullable(),
  concerne: z
    .string()
    .nullable()
    .describe(
      'Si l’élément concerne une tâche EXISTANTE de la liste (mise à jour ou rendu), son numéro, sinon null.',
    ),
  groupe: z
    .enum(['RT4', 'RT4/1', 'RT4/2'])
    .describe('Groupe concerné : RT4 (toute la filière, par défaut), RT4/1 ou RT4/2.'),
  remplace: z
    .boolean()
    .describe(
      'Pour une tâche CONNUE : vrai si cette info MODIFIE ou ANNULE ce qui était dit (autre date, autre salle, autre mode de rendu) ; faux si elle COMPLÈTE.',
    ),
  aspects: z
    .array(z.enum(['date', 'lieu', 'rendu', 'modalites', 'contenu']))
    .describe(
      'Ce que l’info précise : date, lieu (salle, en ligne), rendu (comment rendre), modalites (soutenance, présentiel/en ligne, durée), contenu (ce qu’il faut faire).',
    ),
  projet: z
    .object({
      titre: z.string().describe('Titre court du projet de cours, ex. « Projet RHD ».'),
      etapes: z
        .number()
        .int()
        .describe(
          'Nombre de livrables ou d’étapes annoncés pour ce projet (conception, remise finale…).',
        ),
    })
    .nullable()
    .describe(
      'Seulement si ce travail fait partie d’un VRAI projet de cours annoncé par un prof avec plusieurs livrables ou étapes. null pour un TD, un exercice, un TP isolé.',
    ),
  importance: z.enum(['basse', 'normale', 'haute']),
  confiance: z.number().min(0).max(1).describe('Ta certitude, de 0 à 1.'),
  citation: z.string().describe('Court extrait exact du texte qui justifie l’élément.'),
  seance: z
    .object({
      nature: z.enum(['annulee', 'reportee', 'en_ligne', 'rattrapage', 'changement_salle']),
      date: echeanceSchema.describe(
        'Jour et heure de la séance concernée, tels qu’écrits (rattrapage : la nouvelle séance).',
      ),
      nouvelle_date: echeanceSchema.nullable().describe('Report : nouveau jour et heure.'),
      lien: z.string().nullable().describe('Lien de la séance en ligne (Meet, Teams…).'),
      salle: z.string().nullable(),
    })
    .nullable()
    .describe('Uniquement pour « changement_seance » et « seance_en_ligne », sinon null.'),
});

export const analyseSchema = z.object({
  resultats: z.array(
    z.object({
      id: z.number().int().describe('Numéro de l’élément source analysé.'),
      pertinent: z
        .boolean()
        .describe('Vrai si l’élément concerne les études de Fares (cours, TP, devoirs, examens…).'),
      matiere: z.string().nullable(),
      elements: z.array(elementSchema),
    }),
  ),
});

export type Echeance = z.infer<typeof echeanceSchema>;
export type Element = z.infer<typeof elementSchema>;
export type Analyse = z.infer<typeof analyseSchema>;
