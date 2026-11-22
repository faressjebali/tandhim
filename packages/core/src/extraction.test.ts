import { describe, expect, it } from 'vitest';
import {
  conflitTitres,
  idsDocumentsGoogle,
  resoudreEcheance,
  ressemblanceTitres,
} from './extraction';

const vide = { date: null, heure: null, jour: null, proximite: null, decalage_jours: null };
const lundi23 = '2026-11-23';

describe('résolution de l’échéance lue par l’IA', () => {
  it('date explicite, avec ou sans heure (heure de Tunis)', () => {
    expect(resoudreEcheance({ ...vide, date: '2026-12-03' }, lundi23)).toEqual({
      echeance: new Date('2026-12-03T22:59:00Z'),
      jourEntier: true,
    });
    expect(resoudreEcheance({ ...vide, date: '2026-12-03', heure: '8:00' }, lundi23)).toEqual({
      echeance: new Date('2026-12-03T07:00:00Z'),
      jourEntier: false,
    });
  });

  it('« lkhmis jey » / « lkhmis hedha » selon la règle de Fares, depuis le jour du message', () => {
    const jey = resoudreEcheance({ ...vide, jour: 'jeudi', proximite: 'jey' }, lundi23);
    expect(jey?.echeance.toISOString()).toBe('2026-12-03T22:59:00.000Z');
    const hedha = resoudreEcheance({ ...vide, jour: 'jeudi', proximite: null }, lundi23);
    expect(hedha?.echeance.toISOString()).toBe('2026-11-26T22:59:00.000Z');
  });

  it('« ghodwa » à 14:00 ; rien d’exploitable → pas d’échéance', () => {
    const r = resoudreEcheance({ ...vide, decalage_jours: 1, heure: '14:00' }, lundi23);
    expect(r?.echeance.toISOString()).toBe('2026-11-24T13:00:00.000Z');
    expect(resoudreEcheance(vide, lundi23)).toBeNull();
    expect(resoudreEcheance({ ...vide, date: '3 décembre' }, lundi23)).toBeNull();
    expect(resoudreEcheance(null, lundi23)).toBeNull();
  });
});

describe('ressemblance de titres (dédoublonnage)', () => {
  it('reconnaît le même travail écrit autrement', () => {
    expect(ressemblanceTitres('Compte rendu TP3 TNS', 'CR du TP 3')).toBeGreaterThanOrEqual(0.5);
    expect(
      ressemblanceTitres('Rapport du mini-projet ML', 'Mini projet ML : rapport'),
    ).toBeGreaterThanOrEqual(0.5);
  });

  it('distingue deux travaux différents', () => {
    expect(ressemblanceTitres('Compte rendu TP2', 'Compte rendu TP3')).toBe(0);
    expect(ressemblanceTitres('Présentation anglais', 'Compte rendu TP3')).toBeLessThan(0.2);
  });
});

describe('documents Google cités par un lien', () => {
  it('Sheets, Docs, fichiers Drive ; sans doublon', () => {
    const t = `Voici le planning https://docs.google.com/spreadsheets/d/1PlanningDemoAbCdEfGhIjKlMnOpQrStUv/edit?gid=961466575#gid=961466575
    et l'énoncé <https://drive.google.com/file/d/1EnonceDemoAbCdEfGhIjKlMnOpQr012345/view?usp=drive_web>
    (même planning : https://docs.google.com/spreadsheets/d/1PlanningDemoAbCdEfGhIjKlMnOpQrStUv/edit)
    https://drive.google.com/open?id=1FichierDemoZyXwVuTsRqPoNmLk98765`;
    expect(idsDocumentsGoogle(t)).toEqual([
      '1PlanningDemoAbCdEfGhIjKlMnOpQrStUv',
      '1EnonceDemoAbCdEfGhIjKlMnOpQr012345',
      '1FichierDemoZyXwVuTsRqPoNmLk98765',
    ]);
    expect(idsDocumentsGoogle('rien ici https://meet.google.com/abc-defg-hij')).toEqual([]);
    expect(idsDocumentsGoogle(null)).toEqual([]);
  });
});

describe('échéance relative : ambiguïté et verbe au passé', () => {
  const lue = (v: Partial<Parameters<typeof resoudreEcheance>[0] & object>) => ({
    date: null,
    heure: null,
    jour: null,
    proximite: null,
    decalage_jours: null,
    ...v,
  });
  it('samedi + « vendredi jey » : 27/11, ambigu', () => {
    expect(
      resoudreEcheance(lue({ jour: 'vendredi', proximite: 'jey' }), '2026-11-21'),
    ).toMatchObject({
      ambigu: true,
      jourEntier: true,
    });
  });
  it('verbe au passé : jour écoulé, sans ambiguïté', () => {
    const r = resoudreEcheance(
      lue({ jour: 'jeudi', proximite: 'hedha', passe: true }),
      '2026-11-27',
    );
    expect(r?.echeance).toEqual(new Date('2026-11-26T22:59:00Z'));
    expect(r?.ambigu).toBeUndefined();
  });
});

describe('conflit évident entre deux titres', () => {
  it('natures ou numéros différents', () => {
    expect(conflitTitres('Atelier 3 Machine Learning', 'Mini-projet Machine Learning')).toBe(true);
    expect(conflitTitres('ML_Atelier 3', 'Atelier 2 ML')).toBe(true);
    expect(conflitTitres('TP3 PRM', 'DS PRM')).toBe(true);
    expect(conflitTitres('Validation TP3 PRM', 'TP3 PRM')).toBe(false);
    expect(conflitTitres('ML_Atelier 3', 'Atelier 3 Machine Learning')).toBe(false);
    expect(conflitTitres('Envoi CR', 'Compte rendu TP3')).toBe(false);
  });
});

describe('« TP » sans numéro et « TP2 / TP3 »', () => {
  it('même travail reconnu', () => {
    expect(
      ressemblanceTitres('Validation TP Frameworks', 'Validation TP2 / TP3 Frameworks'),
    ).toBeGreaterThanOrEqual(0.5);
    expect(ressemblanceTitres('Validation TP2 Frameworks', 'Validation TP3 Frameworks')).toBe(0);
  });
});
