/**
 * Schéma SQLite (Drizzle). Conventions :
 * - un jour calendaire (Tunis) est stocké en texte « AAAA-MM-JJ » (colonnes *Date) ;
 * - un instant est stocké en texte ISO 8601 UTC (colonnes *At) ;
 * - `lockedByUser` : la ligne a été corrigée à la main, aucune synchro ne l'écrase.
 * Les tables des étapes suivantes (éléments, sources, Classroom…) seront ajoutées au fur et à mesure.
 */
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);
const updatedAt = () =>
  text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

export const subjects = sqliteTable('subjects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  aliases: text('aliases', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  teacher: text('teacher'),
  color: text('color').notNull(),
  submissionsViaClassroom: integer('submissions_via_classroom', { mode: 'boolean' })
    .notNull()
    .default(false),
  notes: text('notes'),
  lockedByUser: integer('locked_by_user', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const semesters = sqliteTable(
  'semesters',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    academicYear: text('academic_year').notNull(),
    number: integer('number').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
  },
  (t) => [uniqueIndex('semesters_year_number').on(t.academicYear, t.number)],
);

export const academicWeeks = sqliteTable('academic_weeks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  semesterId: integer('semester_id')
    .notNull()
    .references(() => semesters.id),
  number: integer('number').notNull(),
  letter: text('letter', { enum: ['a', 'b'] }).notNull(),
  startDate: text('start_date').notNull().unique(),
});

export const academicEvents = sqliteTable(
  'academic_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', {
      enum: [
        'ds',
        'examens',
        'vacances',
        'ferie',
        'ferie_lunaire',
        'arret_cours',
        'controle',
        'deliberation',
        'validation_notes',
        'fete',
      ],
    }).notNull(),
    title: text('title').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    status: text('status', { enum: ['confirme', 'a_confirmer'] })
      .notNull()
      .default('confirme'),
    blocksClasses: integer('blocks_classes', { mode: 'boolean' }).notNull().default(true),
    /** Origine de l'information : seed, manual, gmail, messenger… */
    source: text('source').notNull().default('seed'),
    lockedByUser: integer('locked_by_user', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('academic_events_natural').on(t.kind, t.title, t.startDate)],
);

export const timetables = sqliteTable('timetables', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull().unique(),
  validFrom: text('valid_from').notNull(),
  validTo: text('valid_to').notNull(),
  /** Chemin de l'image/PDF source si l'emploi du temps vient d'un import. */
  sourceFile: text('source_file'),
  archivedAt: text('archived_at'),
  createdAt: createdAt(),
});

export const timetableSlots = sqliteTable(
  'timetable_slots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timetableId: integer('timetable_id')
      .notNull()
      .references(() => timetables.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    slot: text('slot', { enum: ['C1', 'C2', 'C3', 'C4', 'C5'] }).notNull(),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => subjects.id),
    type: text('type', { enum: ['C', 'TD', 'TP', 'CI'] }).notNull(),
    room: text('room').notNull(),
    teacher: text('teacher').notNull(),
    weeks: text('weeks', { enum: ['all', 'A', 'B'] })
      .notNull()
      .default('all'),
    /** Case lue avec doute lors d'un import (badge « à vérifier »). */
    needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('timetable_slots_natural').on(t.timetableId, t.dayOfWeek, t.slot, t.weeks)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: updatedAt(),
});

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  /** Projet de cours (lié à une matière) ou personnel. */
  kind: text('kind', { enum: ['cours', 'perso'] }).notNull(),
  subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
  description: text('description'),
  /** Échéance du projet (jour à Tunis). */
  deadlineDate: text('deadline_date'),
  /** Couleur de la carte pour un projet perso (les projets de cours prennent la couleur de la matière). */
  color: text('color'),
  status: text('status', { enum: ['en_cours', 'termine', 'archive'] })
    .notNull()
    .default('en_cours'),
  /** Créé par Fares (manuel) ou proposé par l'IA (projet de cours à plusieurs livrables). */
  source: text('source', { enum: ['manuel', 'ia'] })
    .notNull()
    .default('manuel'),
  /** Projet proposé par l'IA, pas encore validé par Fares. */
  needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Éléments à faire ou à suivre (SPEC §3.2, §9). Saisis à la main pour l'instant ;
 * Classroom, Gmail et Messenger en créeront aussi (avec source, confiance, « à vérifier »).
 */
export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', {
      enum: [
        'tache',
        'devoir',
        'tp',
        'validation',
        'projet',
        'ds',
        'examen',
        'seance_en_ligne',
        'annonce',
        'info_prof',
        'revision',
      ],
    })
      .notNull()
      .default('tache'),
    title: text('title').notNull(),
    description: text('description'),
    subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    /** Échéance (instant UTC ISO). Une échéance « jour entier » est stockée à 23:59 heure de Tunis. */
    dueAt: text('due_at'),
    dueAllDay: integer('due_all_day', { mode: 'boolean' }).notNull().default(true),
    importance: text('importance', { enum: ['basse', 'normale', 'haute'] })
      .notNull()
      .default('normale'),
    status: text('status', { enum: ['a_faire', 'en_cours', 'termine'] })
      .notNull()
      .default('a_faire'),
    completedAt: text('completed_at'),
    /** manuel, classroom, gmail, messenger, drive… */
    source: text('source').notNull().default('manuel'),
    /** Identifiant chez la source (ex. id du devoir Classroom) : évite les doublons à chaque synchro. */
    externalId: text('external_id'),
    accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    sourceUrl: text('source_url'),
    confidence: integer('confidence'),
    /** Comment le faire : mode de rendu et précisions (destinataire, format, fichiers). */
    howMode: text('how_mode', {
      enum: ['mail', 'classroom', 'presentiel', 'validation', 'en_ligne', 'autre'],
    }),
    howTo: text('how_to'),
    needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
    lockedByUser: integer('locked_by_user', { mode: 'boolean' }).notNull().default(false),
    /** Fiabilité de la source de l'échéance : une source moins fiable ne la remplace jamais. */
    niveauEcheance: text('niveau_echeance', { enum: ['messenger', 'ecrit', 'fares'] })
      .notNull()
      .default('ecrit'),
    /** Groupe concerné : RT4 (toute la filière), RT4/1 (celui de Fares) ou RT4/2 (stocké, masqué). */
    groupe: text('groupe', { enum: ['RT4', 'RT4/1', 'RT4/2'] })
      .notNull()
      .default('RT4'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('items_source_externe').on(t.source, t.externalId)],
);

/** Comptes connectés (Google fac / perso). Le jeton de rafraîchissement est chiffré (AES-256-GCM). */
export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider', { enum: ['google'] }).notNull(),
  email: text('email').notNull().unique(),
  label: text('label').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  scopes: text('scopes').notNull(),
  /** ok, a_reconnecter (jeton révoqué ou expiré) */
  status: text('status', { enum: ['ok', 'a_reconnecter'] })
    .notNull()
    .default('ok'),
  connectedAt: createdAt(),
  updatedAt: updatedAt(),
});

export const classroomCourses = sqliteTable(
  'classroom_courses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    googleId: text('google_id').notNull(),
    name: text('name').notNull(),
    section: text('section'),
    link: text('link'),
    subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    /** Synchroniser devoirs et annonces de ce cours. */
    followed: integer('followed', { mode: 'boolean' }).notNull().default(false),
    /** Rapprochement matière / suivi choisi automatiquement, pas encore confirmé par Fares. */
    suggested: integer('suggested', { mode: 'boolean' }).notNull().default(true),
    lastSeenAt: text('last_seen_at'),
  },
  (t) => [uniqueIndex('classroom_courses_compte_cours').on(t.accountId, t.googleId)],
);

/** Annonces et supports Classroom (affichés sur la page de la matière ; extraction IA en phase 3). */
export const classroomPosts = sqliteTable(
  'classroom_posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    courseId: integer('course_id')
      .notNull()
      .references(() => classroomCourses.id, { onDelete: 'cascade' }),
    googleId: text('google_id').notNull(),
    kind: text('kind', { enum: ['annonce', 'support'] }).notNull(),
    title: text('title'),
    text: text('text'),
    link: text('link'),
    postedAt: text('posted_at').notNull(),
  },
  (t) => [uniqueIndex('classroom_posts_cours_post').on(t.courseId, t.googleId)],
);

/** État des synchros (page « État des synchros »), une ligne par source et par compte. */
export const syncStatus = sqliteTable('sync_status', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  lastSuccessAt: text('last_success_at'),
  lastErrorAt: text('last_error_at'),
  lastError: text('last_error'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  nextRetryAt: text('next_retry_at'),
  /** Début de la panne en cours (null si la dernière tentative a réussi) : alerte au-delà de 3 h. */
  enEchecDepuis: text('en_echec_depuis'),
  details: text('details'),
});

/**
 * Éléments sources normalisés (SPEC §6.1) : un mail, une annonce ou un support Classroom…
 * Le moteur IA les analyse puis crée ou met à jour des tâches (lien dans item_sources).
 */
export const sourceItems = sqliteTable(
  'source_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    source: text('source', { enum: ['gmail', 'classroom', 'drive', 'messenger'] }).notNull(),
    accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    threadId: text('thread_id'),
    /** recu = message reçu ; envoye = mail envoyé par Fares (sert à détecter un rendu). */
    direction: text('direction', { enum: ['recu', 'envoye'] })
      .notNull()
      .default('recu'),
    sender: text('sender'),
    recipients: text('recipients'),
    title: text('title'),
    body: text('body'),
    sentAt: text('sent_at').notNull(),
    link: text('link'),
    attachments: text('attachments', { mode: 'json' })
      .$type<{ nom: string; type: string; taille: number; id?: string; url?: string }[]>()
      .notNull()
      .default(sql`'[]'`),
    /**
     * Messages qui composent une conversation Messenger (identifiant Matrix + texte) : le lien
     * « Ouvrir dans Element » pointe vers celui qui contient l'information, pas vers le premier.
     */
    passages: text('passages', { mode: 'json' })
      .$type<{ id: string; texte: string }[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Matière connue d'avance (ex. annonce d'un cours Classroom rattaché à une matière). */
    subjectHintId: integer('subject_hint_id').references(() => subjects.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: ['a_traiter', 'traite', 'ignore', 'erreur'] })
      .notNull()
      .default('a_traiter'),
    pertinent: integer('pertinent', { mode: 'boolean' }),
    analysis: text('analysis', { mode: 'json' }),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    processedAt: text('processed_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('source_items_source_externe').on(t.source, t.externalId)],
);

/** Sources d'une tâche : toutes les infos qui l'ont créée, modifiée, confirmée ou terminée. */
export const itemSources = sqliteTable(
  'item_sources',
  {
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    sourceItemId: integer('source_item_id')
      .notNull()
      .references(() => sourceItems.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['creation', 'mise_a_jour', 'confirmation', 'rendu'] }).notNull(),
    quote: text('quote'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('item_sources_lien').on(t.itemId, t.sourceItemId)],
);

/** Historique des changements d'une tâche (ancienne valeur conservée, SPEC §2). */
export const itemHistory = sqliteTable('item_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  field: text('field').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  sourceItemId: integer('source_item_id').references(() => sourceItems.id, {
    onDelete: 'set null',
  }),
  at: createdAt(),
});

/** Consommation du quota Gemini gratuit, par jour (Tunis) et par modèle. */
export const aiUsage = sqliteTable(
  'ai_usage',
  {
    day: text('day').notNull(),
    model: text('model').notNull(),
    requests: integer('requests').notNull().default(0),
    tokens: integer('tokens').notNull().default(0),
  },
  (t) => [uniqueIndex('ai_usage_jour_modele').on(t.day, t.model)],
);

/** Appareils abonnés aux notifications (Web Push : iPhone en PWA, navigateur du PC). */
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  /** « iPhone », « Windows »… pour s'y retrouver dans les réglages. */
  appareil: text('appareil'),
  lastSuccessAt: text('last_success_at'),
  lastError: text('last_error'),
  createdAt: createdAt(),
});

/**
 * Changements de séance détectés par l'IA (annulation, report, en ligne, rattrapage, salle).
 * Un seul changement par séance (matière + jour + créneau) : le message le plus récent l'emporte.
 */
export const changementsSeance = sqliteTable('changements_seance', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subjectId: integer('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  /** Jour de la séance concernée (AAAA-MM-JJ) ; pour un rattrapage, jour de la nouvelle séance. */
  jour: text('jour').notNull(),
  /** C1…C5 ; null avec `heure` = hors créneau ; null sans heure = toutes les séances du jour. */
  creneau: text('creneau'),
  /** Heure écrite (HH:MM). */
  heure: text('heure'),
  nature: text('nature', {
    enum: ['annulee', 'reportee', 'en_ligne', 'rattrapage', 'changement_salle'],
  }).notNull(),
  nouveauJour: text('nouveau_jour'),
  nouveauCreneau: text('nouveau_creneau'),
  nouvelleHeure: text('nouvelle_heure'),
  /** Lien de la réunion, ou son code quand il n'y a pas de lien. */
  lien: text('lien'),
  salle: text('salle'),
  sourceItemId: integer('source_item_id').references(() => sourceItems.id, {
    onDelete: 'set null',
  }),
  citation: text('citation'),
  confidence: integer('confidence'),
  /** Écarté par Fares : n'est plus affiché ni recréé par une synchro. */
  /** Groupe concerné (RT4, RT4/1 ou RT4/2 : stocké mais masqué). */
  groupe: text('groupe', { enum: ['RT4', 'RT4/1', 'RT4/2'] })
    .notNull()
    .default('RT4'),
  ignore: integer('ignore', { mode: 'boolean' }).notNull().default(false),
  notifieLe: text('notifie_le'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Dossiers Google Drive suivis (ex. dossier partagé de Machine Learning), lecture seule. */
export const dossiersDrive = sqliteTable('dossiers_drive', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  folderId: text('folder_id').notNull().unique(),
  /** Compte qui y a accès (trouvé par le worker au premier passage). */
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  nom: text('nom'),
  subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
  lastSeenAt: text('last_seen_at'),
  createdAt: createdAt(),
});

/**
 * Sondages Messenger : les votes arrivent au fil des synchros, on les cumule ici.
 * Un nouveau résumé n'est donné à l'IA que si le résultat change (signature).
 */
export const sondagesMessenger = sqliteTable('sondages_messenger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  salon: text('salon').notNull(),
  eventId: text('event_id').notNull().unique(),
  auteur: text('auteur').notNull(),
  creeLe: text('cree_le').notNull(),
  question: text('question').notNull(),
  options: text('options', { mode: 'json' }).$type<{ id: string; texte: string }[]>().notNull(),
  /** Dernier vote de chaque personne : { votant: { date, choix } }. */
  votes: text('votes', { mode: 'json' })
    .$type<Record<string, { date: string; choix: string[] }>>()
    .notNull()
    .default(sql`'{}'`),
  clos: integer('clos', { mode: 'boolean' }).notNull().default(false),
  signatureEnvoyee: text('signature_envoyee'),
});

/**
 * Consignes cumulées d'une tâche : chaque info reçue est gardée (date, source, niveau). Une info qui
 * remplace barre l'ancienne seulement si elle est au moins aussi fiable (toi > écrit > Messenger).
 */
export const consignes = sqliteTable('consignes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  sourceItemId: integer('source_item_id').references(() => sourceItems.id, {
    onDelete: 'set null',
  }),
  niveau: text('niveau', { enum: ['messenger', 'ecrit', 'fares'] }).notNull(),
  /** date, lieu, rendu, modalites, contenu */
  aspects: text('aspects', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  texte: text('texte').notNull(),
  /** Date de l'info (envoi du message), ISO. */
  dateInfo: text('date_info').notNull(),
  /** Remplacée par une info plus récente au moins aussi fiable (affichée barrée). */
  remplacee: integer('remplacee', { mode: 'boolean' }).notNull().default(false),
  /** Contredit une consigne plus fiable : affichée à côté, « à vérifier ». */
  aVerifier: integer('a_verifier', { mode: 'boolean' }).notNull().default(false),
  /** Nouvelle date proposée mais pas appliquée (source moins fiable, ou tâche modifiée par Fares). */
  echeanceProposee: text('echeance_proposee'),
  /** Fares l'a vue (sinon pastille « Nouvelle info »). */
  vue: integer('vue', { mode: 'boolean' }).notNull().default(true),
  notifier: integer('notifier', { mode: 'boolean' }).notNull().default(false),
  notifieeLe: text('notifiee_le'),
  createdAt: createdAt(),
});

/** Séances de révision planifiées avant les épreuves (DS, examens), cochables (SPEC §6.6). */
export const seancesRevision = sqliteTable('seances_revision', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** L'épreuve (tâche de type ds ou examen) préparée par cette séance. */
  itemId: integer('item_id')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  debut: text('debut').notNull(),
  fin: text('fin').notNull(),
  faite: integer('faite', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
});

/** Rappels déjà envoyés : une échéance déplacée redonne droit à un rappel. */
export const notificationsEnvoyees = sqliteTable(
  'notifications_envoyees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['echeance'] }).notNull(),
    dueAt: text('due_at').notNull(),
    sentAt: createdAt(),
  },
  (t) => [uniqueIndex('notifications_une_fois').on(t.itemId, t.kind, t.dueAt)],
);
