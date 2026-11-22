import { describe, expect, it } from 'vitest';
import { type TacheTriable, avancement, estEnRetard, libelleEcheance, trierTaches } from './taches';

const maintenant = new Date('2026-11-23T10:00:00Z');
const jours = (n: number) => new Date(maintenant.getTime() + n * 86_400_000);
let id = 0;
const t = (p: Partial<TacheTriable>): TacheTriable => ({
  id: ++id,
  statut: 'a_faire',
  importance: 'normale',
  echeance: null,
  creeLe: new Date('2026-11-01T00:00:00Z'),
  ...p,
});
const ordre = (ts: TacheTriable[]) => trierTaches(ts, maintenant).map((x) => x.id);

describe('tri des tâches', () => {
  it('en retard d’abord, puis par échéance la plus proche, sans échéance à la fin', () => {
    const sansDate = t({});
    const dans5 = t({ echeance: jours(5) });
    const retard = t({ echeance: jours(-1) });
    const demain = t({ echeance: jours(1) });
    expect(ordre([sansDate, dans5, retard, demain])).toEqual([
      retard.id,
      demain.id,
      dans5.id,
      sansDate.id,
    ]);
  });

  it('une tâche importante dans 4 jours passe avant une tâche normale dans 2 jours', () => {
    const normale2 = t({ echeance: jours(2) });
    const importante4 = t({ echeance: jours(4), importance: 'haute' });
    expect(ordre([normale2, importante4])).toEqual([importante4.id, normale2.id]);
  });

  it('mais pas avant une tâche normale due demain si l’écart dépasse le décalage', () => {
    const normale1 = t({ echeance: jours(1) });
    const importante5 = t({ echeance: jours(5), importance: 'haute' });
    expect(ordre([importante5, normale1])).toEqual([normale1.id, importante5.id]);
  });

  it('peu importante recule de 3 jours ; à égalité, la plus importante d’abord', () => {
    const basse1 = t({ echeance: jours(1), importance: 'basse' });
    const normale3 = t({ echeance: jours(3) });
    expect(ordre([basse1, normale3])).toEqual([normale3.id, basse1.id]);
    const a = t({ echeance: jours(2), importance: 'normale' });
    const b = t({ echeance: jours(5), importance: 'haute' }); // effective = jour 2 aussi
    expect(ordre([a, b])).toEqual([b.id, a.id]);
  });

  it('les retards restent en tête, même peu importants', () => {
    const retardBasse = t({ echeance: jours(-2), importance: 'basse' });
    const hauteDemain = t({ echeance: jours(1), importance: 'haute' });
    expect(ordre([hauteDemain, retardBasse])).toEqual([retardBasse.id, hauteDemain.id]);
  });

  it('sans échéance : par importance puis par ancienneté ; terminées exclues', () => {
    const ancienne = t({ creeLe: new Date('2026-10-01') });
    const haute = t({ importance: 'haute', creeLe: new Date('2026-11-20') });
    const finie = t({ statut: 'termine', echeance: jours(1) });
    expect(ordre([ancienne, finie, haute])).toEqual([haute.id, ancienne.id]);
  });

  it('une tâche terminée n’est jamais « en retard »', () => {
    expect(estEnRetard(t({ echeance: jours(-1), statut: 'termine' }), maintenant)).toBe(false);
    expect(estEnRetard(t({ echeance: jours(-1) }), maintenant)).toBe(true);
  });
});

describe('avancement d’un projet', () => {
  it('pourcentage de tâches terminées, arrondi', () => {
    expect(avancement([])).toBe(0);
    expect(avancement([{ statut: 'termine' }, { statut: 'a_faire' }, { statut: 'en_cours' }])).toBe(
      33,
    );
    expect(avancement([{ statut: 'termine' }, { statut: 'termine' }])).toBe(100);
  });
});

describe('libellé d’échéance', () => {
  const lundi10h = new Date('2026-11-23T09:00:00Z'); // lundi 23/11 10:00 à Tunis
  const l = (iso: string, jourEntier = true) =>
    libelleEcheance(new Date(iso), jourEntier, lundi10h);
  it('retard, aujourd’hui, demain, jour de la semaine, date', () => {
    expect(l('2026-11-21T22:59:00Z')).toEqual({ texte: 'En retard de 2 j', urgence: 'retard' });
    expect(l('2026-11-23T08:00:00Z', false)).toEqual({ texte: 'En retard', urgence: 'retard' });
    expect(l('2026-11-23T13:00:00Z', false)).toEqual({
      texte: 'Aujourd’hui 14:00',
      urgence: 'proche',
    });
    expect(l('2026-11-24T22:59:00Z')).toEqual({ texte: 'Demain', urgence: 'proche' });
    expect(l('2026-11-26T22:59:00Z')).toEqual({ texte: 'Jeudi', urgence: 'semaine' });
    expect(l('2026-12-03T22:59:00Z')).toEqual({ texte: '3 déc.', urgence: 'loin' });
    expect(libelleEcheance(null, true, lundi10h)).toEqual({
      texte: 'Sans échéance',
      urgence: 'aucune',
    });
  });
  it('le changement de jour suit l’heure de Tunis, pas UTC', () => {
    // 23:30 UTC le lundi = 00:30 mardi à Tunis → « Demain » vu depuis lundi
    expect(l('2026-11-23T23:30:00Z', false).texte).toBe('Demain 00:30');
  });
});
