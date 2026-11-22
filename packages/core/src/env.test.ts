import { describe, expect, it } from 'vitest';
import { loadEnv, requireEnv } from './env';

describe('loadEnv', () => {
  it('applique les valeurs par défaut', () => {
    const env = loadEnv({});
    expect(env.TZ).toBe('Africa/Tunis');
    expect(env.GEMINI_RPM).toBe(15);
  });

  it('convertit les nombres', () => {
    expect(loadEnv({ GEMINI_RPD: '500' }).GEMINI_RPD).toBe(500);
  });

  it('traite une valeur vide comme absente', () => {
    const env = loadEnv({ SESSION_SECRET: '', GEMINI_MODEL: '' });
    expect(env.SESSION_SECRET).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
  });

  it('refuse une valeur invalide', () => {
    expect(() => loadEnv({ GEMINI_RPM: 'abc' })).toThrow(/invalides/);
  });

  it('requireEnv explique la variable manquante', () => {
    expect(() => requireEnv(loadEnv({}), 'GEMINI_API_KEY')).toThrow(/GEMINI_API_KEY/);
  });
});
