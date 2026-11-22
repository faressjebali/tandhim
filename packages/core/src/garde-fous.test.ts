import { describe, expect, it } from 'vitest';
import { resoudreEcheance } from './extraction';
import { jourCorrige, verdictSeance } from './garde-fous';
import { tunisDayKey } from './time';

const seance = (citation: string, nature = 'en_ligne', titre = '') => ({
  type: 'seance_en_ligne',
  citation,
  titre,
  seance: { nature },
});

describe('garde-fous : sondages, questions et séances qui ne changent pas', () => {
  const conv = [
    '[18:02] Étudiant A : lance un sondage : « Seance ML 10/12 en ligne » (options : 18 h / 21 h)',
    '[18:05] Déléguée : 1er groupe : séance de PU demain en ligne à 9h45. 2ème groupe : présentiel comme d’habitude.',
  ].join('\n');

  it('un sondage encore ouvert ou une question n’est pas une décision', () => {
    expect(verdictSeance(seance('Seance ML 10/12 en ligne'), conv)).toBe('info');
    expect(verdictSeance(seance('fama seance en ligne lkhmis ?'), conv)).toBe('info');
  });
  it('« présentiel comme d’habitude » n’est pas un changement', () => {
    expect(verdictSeance(seance('2ème groupe : présentiel comme d’habitude'), conv)).toBe(
      'ignorer',
    );
  });
  it('un vrai changement est gardé', () => {
    expect(verdictSeance(seance('séance de PU demain en ligne à 9h45'), conv)).toBe('garder');
    expect(verdictSeance(seance('la séance de droit est annulée', 'annulee'), 'x')).toBe('garder');
  });
  it('ne touche pas aux autres types d’éléments', () => {
    expect(verdictSeance({ type: 'devoir', citation: 'rendu ?' }, conv)).toBe('garder');
  });
});

describe('garde-fous : dates', () => {
  it('jour corrigé plus loin dans la conversation', () => {
    const t = '[09:12] Déléguée : l validation jeudi le 10, sorry ghalt ktbt 11 fel message lowel';
    expect(jourCorrige('2026-12-11', t)).toBe('2026-12-10');
    // L'IA avait déjà le bon jour : surtout ne rien inverser.
    expect(jourCorrige('2026-12-10', t)).toBeNull();
    expect(jourCorrige('2026-11-25', 'pardon c’est le 24 et pas le 25')).toBe('2026-11-24');
    expect(jourCorrige('2026-11-25', 'séance le 25 à 14h')).toBeNull();
    expect(jourCorrige('2026-11-25', 'pardon c’est le 3 et pas le 25')).toBeNull(); // trop loin
  });
  it('date écrite contredite par le jour cité : le jour l’emporte, à vérifier', () => {
    // « mardi 25/11 » alors que le 25/11/2026 est un mercredi ; message du jeudi 19/11.
    const r = resoudreEcheance(
      { date: '2026-11-25', heure: null, jour: 'mardi', proximite: 'jey', decalage_jours: null },
      '2026-11-19',
    );
    expect(r && tunisDayKey(r.echeance)).toBe('2026-11-24');
    expect(r?.ambigu).toBe(true);
  });
  it('date et jour cohérents : rien ne change', () => {
    const r = resoudreEcheance(
      { date: '2026-11-24', heure: null, jour: 'mardi', proximite: 'jey', decalage_jours: null },
      '2026-11-19',
    );
    expect(r && tunisDayKey(r.echeance)).toBe('2026-11-24');
    expect(r?.ambigu).toBeUndefined();
  });
});
