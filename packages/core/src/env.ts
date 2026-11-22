import { z } from 'zod';

/** Schéma des variables d'environnement. Chaque appli ne valide que ce dont elle a besoin. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ: z.string().default('Africa/Tunis'),
  DATA_DIR: z.string().default('./data'),
  APP_URL: z.url().default('http://localhost:3000'),

  /** « 1 » = mode démo : fausses données, sans mot de passe ni source externe. */
  TANDHIM_DEMO: z.enum(['0', '1']).optional(),
  /** « 1 » = aperçu d'écran à une date donnée (?a=…), développement seulement. */
  TANDHIM_APERCU: z.enum(['0', '1']).optional(),
  /** Mode démo : horloge figée « AAAA-MM-JJTHH:MM » (heure de Tunis), pour des captures cohérentes. */
  TANDHIM_DEMO_DATE: z.string().optional(),
  /** Nom de la déléguée, cité dans le prompt de l'IA (donnée personnelle : seulement dans .env). */
  TANDHIM_DELEGUEE: z.string().optional(),

  APP_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  ENCRYPTION_KEY: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.1-flash-lite'),
  /** Modèle plus fort pour lire les documents joints (tableaux, plannings) : peu de requêtes par jour. */
  GEMINI_DOCS_MODEL: z.string().default('gemini-3.8-flash'),
  GEMINI_RPM: z.coerce.number().int().positive().default(15),
  GEMINI_RPD: z.coerce.number().int().positive().default(500),

  /** Messenger : serveur Matrix privé (pont mautrix-meta), jeton du compte de lecture, salons lus. */
  MATRIX_URL: z.url().optional(),
  MATRIX_TOKEN: z.string().optional(),
  /** Identifiants des salons à lire, séparés par des virgules (ex. le groupe de la filière). */
  MATRIX_SALONS: z.string().optional(),

  /** Notifications Web Push : paire de clés VAPID (`pnpm cles-notifications`). */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  // Une ligne `CLE=` vide dans .env vaut « non renseignée ».
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(`Variables d'environnement invalides :\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** Récupère une variable obligatoire avec un message d'erreur clair en français. */
export function requireEnv<K extends keyof Env>(env: Env, key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === '') {
    throw new Error(
      `La variable ${String(key)} est manquante : ajoute-la dans .env (voir .env.example).`,
    );
  }
  return value as NonNullable<Env[K]>;
}

/** Autorisations Google demandées (LECTURE SEULE uniquement — principe non négociable). */
export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

/** Fichier déposé par le web pour demander une synchro immédiate au worker. */
export const FICHIER_SYNCHRO_DEMANDEE = '.synchro-demandee';
/** Fichier déposé par l'app pour demander une notification de test au worker. */
export const FICHIER_NOTIFICATION_TEST = '.notification-test';
