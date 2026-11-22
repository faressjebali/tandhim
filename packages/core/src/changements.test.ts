import { describe, expect, it } from 'vitest';
import { type CalendarData, prochaineSeance } from './calendar';
import {
  type ChangementSeance,
  creneauDuChangement,
  creneauPourHeure,
  instantsDuChangement,
  seanceSupprimee,
  seancesDuJour,
  texteChangement,
} from './changements';

// Semaine 13 (b) : lundi 23/11/2026. Lundi : PRM (TP) en C1, TNS en C2 ; jeudi : TNS en C1 et C4.
const data: CalendarData = {
  weeks: [{ semester: 1, number: 13, letter: 'b', startDate: '2026-11-23' }],
  events: [],
  timetables: [
    {
      label: 'S1',
      validFrom: '2026-09-01',
      validTo: '2027-01-31',
      slots: [
        {
          dayOfWeek: 1,
          slot: 'C1',
          subjectCode: 'PRM',
          type: 'TP',
          room: 'L1',
          teacher: 'Mme Gharbi',
          weeks: 'all',
        },
        {
          dayOfWeek: 1,
          slot: 'C2',
          subjectCode: 'TNS',
          type: 'C',
          room: 'A2',
          teacher: 'Mme Ferchichi',
          weeks: 'all',
        },
        {
          dayOfWeek: 4,
          slot: 'C1',
          subjectCode: 'TNS',
          type: 'TP',
          room: 'L3',
          teacher: 'Mme Ferchichi',
          weeks: 'all',
        },
        {
          dayOfWeek: 4,
          slot: 'C4',
          subjectCode: 'TNS',
          type: 'TD',
          room: 'B1',
          teacher: 'Mme Ferchichi',
          weeks: 'all',
        },
      ],
    },
  ],
};

const changement = (c: Partial<ChangementSeance>): ChangementSeance => ({
  id: 1,
  matiere: 'TNS',
  jour: '2026-11-23',
  creneau: 'C2',
  heure: null,
  nature: 'annulee',
  nouveauJour: null,
  nouveauCreneau: null,
  nouvelleHeure: null,
  lien: null,
  salle: null,
  lienSource: null,
  aVerifier: false,
  ...c,
});

describe('créneau d’un changement', () => {
  it('heure écrite → créneau le plus proche (à 1 h près)', () => {
    expect(creneauPourHeure('08:00')).toBe('C1');
    expect(creneauPourHeure('09:30')).toBe('C2');
    expect(creneauPourHeure('14:00')).toBe('C4');
    expect(creneauPourHeure('19:00')).toBeNull();
    expect(creneauPourHeure(null)).toBeNull();
  });

  it('sans heure : la séance de la matière si elle est seule ce jour-là', () => {
    expect(creneauDuChangement('2026-11-23', null, 'TNS', data)).toBe('C2');
    // Jeudi : deux séances de TNS → impossible de choisir.
    expect(creneauDuChangement('2026-11-26', null, 'TNS', data)).toBeNull();
    expect(creneauDuChangement('2026-11-26', '14:00', 'TNS', data)).toBe('C4');
  });
});

describe('séances du jour avec changements', () => {
  it('annulée : reste visible, marquée supprimée', () => {
    const [prm, tns] = seancesDuJour('2026-11-23', data, [changement({})]);
    expect(prm?.changement).toBeUndefined();
    expect(tns?.changement?.nature).toBe('annulee');
    expect(seanceSupprimee(tns!)).toBe(true);
  });

  it('créneau inconnu : s’applique à toutes les séances de la matière ce jour-là', () => {
    const s = seancesDuJour('2026-11-26', data, [
      changement({
        jour: '2026-11-26',
        creneau: null,
        nature: 'en_ligne',
        lien: 'https://meet.google.com/x',
      }),
    ]);
    expect(s.map((x) => x.changement?.nature)).toEqual(['en_ligne', 'en_ligne']);
  });

  it('report : barrée le jour d’origine, ajoutée le nouveau jour avec type et salle d’origine', () => {
    const c = changement({ nature: 'reportee', nouveauJour: '2026-11-28', nouveauCreneau: 'C3' });
    expect(seanceSupprimee(seancesDuJour('2026-11-23', data, [c])[1]!)).toBe(true);
    const [samedi] = seancesDuJour('2026-11-28', data, [c]);
    expect(samedi).toMatchObject({
      subjectCode: 'TNS',
      slot: 'C3',
      room: 'A2',
      ajoutee: { nature: 'reportee', depuis: '2026-11-23' },
    });
    expect(seanceSupprimee(samedi!)).toBe(false);
  });

  it('rattrapage : séance ajoutée, triée par heure', () => {
    const s = seancesDuJour('2026-11-23', data, [
      changement({ nature: 'rattrapage', creneau: 'C4', salle: 'Amphi B' }),
    ]);
    expect(s.map((x) => `${x.slot} ${x.subjectCode} ${x.room}`)).toEqual([
      'C1 PRM L1',
      'C2 TNS A2',
      'C4 TNS Amphi B',
    ]);
    expect(s[1]?.changement).toBeUndefined();
  });
});

describe('notification d’un changement', () => {
  it('textes lisibles', () => {
    expect(texteChangement(changement({}))).toEqual({
      titre: 'TNS · séance annulée',
      corps: 'Lundi 23/11 à 09:45',
    });
    expect(
      texteChangement(
        changement({ nature: 'reportee', nouveauJour: '2026-11-28', nouveauCreneau: 'C3' }),
      ).corps,
    ).toBe('Lundi 23/11 à 09:45 → samedi 28/11 à 11:30');
    expect(
      texteChangement(changement({ nature: 'en_ligne', lien: 'https://meet.google.com/x' })).corps,
    ).toBe('Lundi 23/11 à 09:45. Touche pour le lien.');
  });

  it('instants : séance d’origine, et nouvelle séance pour un report', () => {
    expect(instantsDuChangement(changement({}))).toEqual([new Date('2026-11-23T08:45:00Z')]);
    expect(
      instantsDuChangement(
        changement({ nature: 'reportee', nouveauJour: '2026-11-28', nouveauCreneau: 'C3' }),
      ),
    ).toEqual([new Date('2026-11-23T08:45:00Z'), new Date('2026-11-28T10:30:00Z')]);
  });
});

describe('séances hors créneau (le soir, un dimanche…)', () => {
  it('heure du soir : aucun créneau, même si la matière a une seule séance ce jour-là', () => {
    expect(creneauDuChangement('2026-11-23', '20:00', 'TNS', data)).toBeNull();
  });

  it('séance en ligne le soir : ajoutée à son heure, la séance du matin reste normale', () => {
    const s = seancesDuJour('2026-11-23', data, [
      changement({ creneau: null, heure: '20:00', nature: 'en_ligne', lien: '564395061' }),
    ]);
    expect(s.map((x) => `${x.slot ?? '-'} ${x.subjectCode}`)).toEqual([
      'C1 PRM',
      'C2 TNS',
      '- TNS',
    ]);
    expect(s[1]?.changement).toBeUndefined();
    expect(s[2]).toMatchObject({ ajoutee: { nature: 'en_ligne' } });
    expect(s[2]?.start).toEqual(new Date('2026-11-23T19:00:00Z'));
    expect(texteChangement(s[2]!.changement!).corps).toBe(
      'Lundi 23/11 à 20:00. Code de la réunion : 564395061',
    );
  });

  it('rattrapage un dimanche, hors créneau', () => {
    const [d] = seancesDuJour('2026-11-29', data, [
      changement({ jour: '2026-11-29', creneau: null, heure: '18:00', nature: 'rattrapage' }),
    ]);
    expect(d).toMatchObject({ slot: null, ajoutee: { nature: 'rattrapage' } });
    expect(instantsDuChangement(d!.changement!)).toEqual([new Date('2026-11-29T17:00:00Z')]);
  });

  it('séance en ligne qui remplace une séance de l’emploi du temps : pas de doublon', () => {
    const s = seancesDuJour('2026-11-23', data, [changement({ nature: 'en_ligne' })]);
    expect(s).toHaveLength(2);
    expect(s[1]?.changement?.nature).toBe('en_ligne');
  });
});

describe('prochaine séance d’une matière', () => {
  it('« à préparer pour la prochaine séance » : la suivante après le message', () => {
    // Message du lundi 23/11 à 10:00 : la séance de TNS de 09:45 a déjà commencé → jeudi 08:00.
    expect(prochaineSeance('TNS', new Date('2026-11-23T09:00:00Z'), data)?.start).toEqual(
      new Date('2026-11-26T07:00:00Z'),
    );
    expect(prochaineSeance('TNS', new Date('2026-11-23T07:00:00Z'), data)?.slot).toBe('C2');
    expect(prochaineSeance('ML', new Date('2026-11-23T07:00:00Z'), data)).toBeUndefined();
  });
});
