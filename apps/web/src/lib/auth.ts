/**
 * Authentification à mot de passe unique (SPEC §4).
 * - Mot de passe : haché avec scrypt (node:crypto), jamais stocké en clair.
 * - Session : cookie signé HMAC-SHA256 avec SESSION_SECRET, valable 180 jours.
 * Utilisé par proxy.ts (Node) et par les actions serveur.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'tandhim_session';
export const SESSION_MAX_AGE_S = 180 * 24 * 60 * 60;

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 } as const;
const MAXMEM = 128 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { ...SCRYPT, maxmem: MAXMEM });
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64'),
    hash.toString('base64'),
    // Séparateur « : » et non « $ » : Docker Compose et les shells interprètent « $ » dans un .env.
  ].join(':');
}

export function verifyPassword(password: string, stored: string): boolean {
  // Accepte aussi l'ancien format séparé par « $ ».
  const [algo, n, r, p, saltB64, hashB64] = stored.split(/[:$]/);
  if (algo !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  // Longueur imposée : un hachage tronqué (copie ou .env abîmé) doit être refusé, pas raccourci.
  if (expected.length !== SCRYPT.keylen) return false;
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sessionSecret(): string | undefined {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : undefined;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Jeton de session signé, ou `undefined` si SESSION_SECRET n'est pas configuré. */
export function createSessionToken(now: number = Date.now()): string | undefined {
  const secret = sessionSecret();
  if (!secret) return undefined;
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_MAX_AGE_S * 1000 })).toString(
    'base64url',
  );
  return `${payload}.${sign(payload, secret)}`;
}

export function isValidSessionToken(token: string | undefined, now: number = Date.now()): boolean {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp: number };
    return typeof exp === 'number' && exp > now;
  } catch {
    return false;
  }
}

/** Configuration complète ? Sinon la page de connexion explique quoi faire. */
export function authConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD_HASH) && Boolean(sessionSecret());
}
