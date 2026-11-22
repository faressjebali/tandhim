import { describe, expect, it } from 'vitest';
import { adresseDe, destinataireSuivi, expediteurSuivi, requeteExpediteurs } from './expediteurs';

describe('expéditeurs suivis', () => {
  it('profs, déléguée, DVURE et DEF : oui', () => {
    for (const f of [
      'Amel GHARBI <amel.gharbi@exemple.tn>',
      'LA DÉLÉGUÉE <deleguee@exemple.tn>',
      'DVURE INSAT <vie-etudiante@exemple.tn>',
      '"DVURE INSAT (via Google Forms)" <vie-etudiante@exemple.tn>',
      'DEF INSAT <etudes@exemple.tn>',
      'Anis SASSI <ANIS.SASSI@exemple.tn>',
    ]) {
      expect(expediteurSuivi(f), f).toBe(true);
    }
  });

  it('profs pas encore vus : reconnus par leur nom dans une adresse INSAT', () => {
    expect(expediteurSuivi('Salma Haddad <salma.haddad@exemple.tn>')).toBe(true);
    expect(expediteurSuivi('<rania.jaziri@exemple.tn>')).toBe(true);
    // … mais pas depuis une autre adresse que l'INSAT
    expect(expediteurSuivi('<haddad.fan@exemple.com>')).toBe(false);
  });

  it('tout le reste : non', () => {
    for (const f of [
      'SOFIANE OUNI <sofiane.ouni@exemple.tn>',
      'ANDROID CLUB INSAT <android-club@exemple.tn>',
      '"\'tasnim BOUDRIGA\' via Etudiants INSAT" <etudiants@exemple.tn>',
      'Information University of Carthage <info@exemple.org>',
      'MOHAMED MEHDI FRIKHA <mohamedmehdi.frikha@exemple.tn>',
      null,
    ]) {
      expect(expediteurSuivi(f), String(f)).toBe(false);
    }
  });

  it('mails envoyés : gardés si un destinataire est suivi', () => {
    expect(destinataireSuivi('Leila Ferchichi <leila.ferchichi@exemple.tn>, ami@exemple.com')).toBe(
      true,
    );
    expect(destinataireSuivi('sofiane.ouni@exemple.tn')).toBe(false);
  });

  it('adresse extraite et requête Gmail', () => {
    expect(adresseDe('X <A@exemple.net>')).toBe('a@exemple.net');
    expect(adresseDe('a@exemple.net')).toBe('a@exemple.net');
    expect(requeteExpediteurs('from')).toContain('vie-etudiante@exemple.tn OR');
  });
});
