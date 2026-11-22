import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, hashPassword, isValidSessionToken, verifyPassword } from './auth';

describe('mot de passe', () => {
  it('vérifie le bon mot de passe et refuse les autres', () => {
    const stored = hashPassword('correct horse battery');
    expect(stored.startsWith('scrypt:')).toBe(true);
    // Aucun « $ » : Docker Compose les interpréterait comme des variables dans le .env.
    expect(stored).not.toContain('$');
    expect(stored).not.toContain('correct horse');
    expect(verifyPassword('correct horse battery', stored)).toBe(true);
    expect(verifyPassword('Correct horse battery', stored)).toBe(false);
    expect(verifyPassword('', stored)).toBe(false);
  });

  it('deux hachages du même mot de passe diffèrent (sel aléatoire)', () => {
    expect(hashPassword('abc')).not.toBe(hashPassword('abc'));
  });

  it('accepte encore l’ancien format séparé par « $ »', () => {
    const ancien = hashPassword('abc').replaceAll(':', '$');
    expect(verifyPassword('abc', ancien)).toBe(true);
  });

  it('refuse un hachage tronqué (comme après une interpolation des « $ »)', () => {
    const stored = hashPassword('abc');
    expect(verifyPassword('abc', stored.slice(0, 60))).toBe(false);
  });

  it('refuse un hachage mal formé', () => {
    expect(verifyPassword('abc', 'n-importe-quoi')).toBe(false);
  });
});

describe('session', () => {
  const previous = process.env.SESSION_SECRET;
  beforeEach(() => {
    process.env.SESSION_SECRET = 'x'.repeat(48);
  });
  afterEach(() => {
    process.env.SESSION_SECRET = previous;
  });

  it('accepte un jeton valide, refuse un jeton modifié ou expiré', () => {
    const now = Date.UTC(2026, 10, 20);
    const token = createSessionToken(now)!;
    expect(isValidSessionToken(token, now + 1000)).toBe(true);
    expect(isValidSessionToken(`${token}x`, now)).toBe(false);
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ exp: now * 2 })).toString('base64url');
    expect(isValidSessionToken(`${forged}.${sig}`, now)).toBe(false);
    expect(isValidSessionToken(`${payload}.${sig}`, now + 181 * 86_400_000)).toBe(false);
  });

  it('refuse tout si le secret change ou manque', () => {
    const token = createSessionToken()!;
    process.env.SESSION_SECRET = 'y'.repeat(48);
    expect(isValidSessionToken(token)).toBe(false);
    delete process.env.SESSION_SECRET;
    expect(createSessionToken()).toBeUndefined();
    expect(isValidSessionToken(token)).toBe(false);
  });
});
