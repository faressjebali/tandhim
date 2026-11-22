import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { chiffrer, dechiffrer } from './node';

const cle = randomBytes(32).toString('base64');

describe('chiffrement des secrets', () => {
  it('aller-retour, et deux chiffrements du même texte diffèrent', () => {
    const a = chiffrer('1//jeton-de-rafraichissement', cle);
    expect(a).not.toContain('jeton');
    expect(dechiffrer(a, cle)).toBe('1//jeton-de-rafraichissement');
    expect(chiffrer('x', cle)).not.toBe(chiffrer('x', cle));
  });

  it('refuse une autre clé, un texte modifié, une clé absente', () => {
    const a = chiffrer('secret', cle);
    expect(() => dechiffrer(a, randomBytes(32).toString('base64'))).toThrow();
    const [v, iv, tag, d] = a.split(':');
    // Altère le 1er caractère (en choisissant toujours une valeur différente) : test déterministe.
    const altere = `${d![0] === 'A' ? 'B' : 'A'}${d!.slice(1)}`;
    expect(() => dechiffrer([v, iv, tag, altere].join(':'), cle)).toThrow();
    expect(() => chiffrer('x', undefined)).toThrow(/ENCRYPTION_KEY/);
  });
});
