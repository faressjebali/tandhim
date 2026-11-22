import { describe, expect, it } from 'vitest';
import { consigneANotifier, dateAcceptee, effetConsigne } from './consignes';

describe('consignes cumulées', () => {
  const prof = { id: 1, niveau: 'ecrit' as const, aspects: ['rendu' as const] };
  const salle = { id: 2, niveau: 'ecrit' as const, aspects: ['lieu' as const] };

  it('une info qui complète ne barre rien', () => {
    expect(effetConsigne([prof], { niveau: 'ecrit', aspects: ['rendu'], remplace: false })).toEqual(
      {
        remplacees: [],
        aVerifier: false,
      },
    );
  });

  it('même niveau ou plus fiable : la plus récente barre l’ancienne (même aspect seulement)', () => {
    expect(
      effetConsigne([prof, salle], { niveau: 'ecrit', aspects: ['rendu'], remplace: true }),
    ).toEqual({
      remplacees: [1],
      aVerifier: false,
    });
  });

  it('une rumeur Messenger ne barre jamais une consigne écrite du prof : à vérifier, à côté', () => {
    expect(
      effetConsigne([prof], { niveau: 'messenger', aspects: ['rendu'], remplace: true }),
    ).toEqual({
      remplacees: [],
      aVerifier: true,
    });
  });

  it('un écrit du prof barre une info Messenger', () => {
    const rumeur = { id: 3, niveau: 'messenger' as const, aspects: ['lieu' as const] };
    expect(
      effetConsigne([rumeur], { niveau: 'ecrit', aspects: ['lieu'], remplace: true }).remplacees,
    ).toEqual([3]);
  });

  it('date : jamais remplacée par une source moins fiable', () => {
    expect(dateAcceptee('ecrit', 'ecrit')).toBe(true);
    expect(dateAcceptee('ecrit', 'messenger')).toBe(true);
    expect(dateAcceptee('messenger', 'ecrit')).toBe(false);
    expect(dateAcceptee('ecrit', 'fares')).toBe(false);
  });

  it('notification : date changée, lieu, rendu, modalités ; pas pour du contenu', () => {
    expect(consigneANotifier(['contenu'], false)).toBe(false);
    expect(consigneANotifier(['date'], false)).toBe(false);
    expect(consigneANotifier(['date'], true)).toBe(true);
    expect(consigneANotifier(['lieu'], false)).toBe(true);
    expect(consigneANotifier(['modalites'], false)).toBe(true);
  });
});
