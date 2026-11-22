import { describe, expect, it } from 'vitest';
import { conseilPanne, panneAAlerter } from './alertes';

const etat = (enEchecDepuis: string | null, key = 'messenger:!s') => ({
  key,
  label: 'Messenger',
  lastError: 'Matrix 502',
  enEchecDepuis,
});
const maintenant = new Date('2026-11-22T12:00:00Z');

describe('alertes de panne', () => {
  it('au-delà de 3 h de panne, une seule fois par panne', () => {
    expect(panneAAlerter(etat('2026-11-22T10:00:00Z'), undefined, maintenant)).toBe(false);
    expect(panneAAlerter(etat('2026-11-22T08:59:00Z'), undefined, maintenant)).toBe(true);
    expect(panneAAlerter(etat('2026-11-22T08:59:00Z'), '2026-11-22T08:59:00Z', maintenant)).toBe(
      false,
    );
    // Nouvelle panne après une reprise : nouvelle alerte.
    expect(panneAAlerter(etat('2026-11-22T08:30:00Z'), '2026-11-21T08:59:00Z', maintenant)).toBe(
      true,
    );
    expect(panneAAlerter(etat(null), undefined, maintenant)).toBe(false);
    expect(
      panneAAlerter(etat('2026-11-21T00:00:00Z', 'notifications'), undefined, maintenant),
    ).toBe(false);
  });

  it('conseils adaptés', () => {
    expect(conseilPanne('gmail:1', 'invalid_grant')).toContain('Reconnecter');
    expect(conseilPanne('ia', '429 RESOURCE_EXHAUSTED')).toContain('demain');
    expect(conseilPanne('messenger-silence:!s', '')).toContain('list-logins');
    expect(conseilPanne('messenger:!s', 'Matrix 401 M_UNKNOWN_TOKEN')).toContain('jeton');
  });
});
