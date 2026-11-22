import { describe, expect, it } from 'vitest';
import { estVisible, groupesCompatibles, normaliserGroupe } from './groupes';

describe('groupes RT4 / RT4/1 / RT4/2', () => {
  it('visibles : RT4 et RT4/1 ; RT4/2 masqué', () => {
    expect(['RT4', 'RT4/1', 'RT4/2'].map(estVisible)).toEqual([true, true, false]);
  });
  it('fusion : même groupe, ou RT4 précisé en RT4/1 ; jamais vers RT4/2', () => {
    expect(groupesCompatibles('RT4', 'RT4/1')).toBe(true);
    expect(groupesCompatibles('RT4/1', 'RT4/1')).toBe(true);
    expect(groupesCompatibles('RT4', 'RT4/2')).toBe(false);
    expect(groupesCompatibles('RT4/1', 'RT4/2')).toBe(false);
    expect(groupesCompatibles('RT4/1', 'RT4')).toBe(false);
  });
  it('valeur inconnue : RT4', () => {
    expect(normaliserGroupe('G3')).toBe('RT4');
    expect(normaliserGroupe(null)).toBe('RT4');
    expect(normaliserGroupe('RT4/2')).toBe('RT4/2');
  });
});
