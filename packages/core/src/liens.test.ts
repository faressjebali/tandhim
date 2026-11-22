import { describe, expect, it } from 'vitest';
import { adressesDuTexte, fichiersDuTexte, lienDuPassage, passageDeLaCitation } from './liens';

const passages = [
  { id: '$a', texte: 'chkoun aando el cours mtaa lbereh ?' },
  { id: '$b', texte: 'ok merci' },
  {
    id: '$c',
    texte: 'mme X l seance mtaa 10/12 bch trodha lundi jey ( seance cours, en ligne mel 18h )',
  },
];
const salon = 'https://app.element.io/#/room/!salon:tandhim';

describe('message exact d’une conversation', () => {
  it('trouve le message qui contient la citation', () => {
    expect(passageDeLaCitation(passages, 'mme X l seance mtaa 10/12 bch trodha lundi')?.id).toBe(
      '$c',
    );
  });
  it('remplace le premier message du lien Element par le bon', () => {
    expect(lienDuPassage(`${salon}/$a`, passages, 'l seance mtaa 10/12 bch trodha lundi')).toBe(
      `${salon}/$c`,
    );
  });
  it('garde le lien si rien ne correspond clairement', () => {
    expect(lienDuPassage(`${salon}/$a`, passages, 'examen de PU lundi')).toBe(`${salon}/$a`);
    expect(lienDuPassage(`${salon}/$a`, [], 'mme X')).toBe(`${salon}/$a`);
    expect(lienDuPassage(`${salon}/$a`, passages, null)).toBe(`${salon}/$a`);
  });
  it('ne touche pas aux liens d’autres sources', () => {
    const gmail = 'https://mail.google.com/mail/#all/abc';
    expect(lienDuPassage(gmail, passages, 'mme X l seance mtaa 10/12')).toBe(gmail);
  });
});

describe('fichiers cités dans un texte', () => {
  it('reconnaît Sheets, Docs, Drive et les fichiers, sans ponctuation finale', () => {
    const t =
      'Planning : https://docs.google.com/spreadsheets/d/1SheetDemoAbCdEfGhIjKlMnOpQr/edit#gid=0. ' +
      'Dépôt : https://drive.google.com/drive/folders/1DossierDemoZyXwVuTsRqPoNmL, ' +
      'énoncé https://exemple.tn/cours/TP2%20ML.pdf et réunion https://meet.google.com/abc-defg-hij';
    expect(fichiersDuTexte(t)).toEqual([
      {
        nom: 'Google Sheets',
        url: 'https://docs.google.com/spreadsheets/d/1SheetDemoAbCdEfGhIjKlMnOpQr/edit#gid=0',
        idDrive: '1SheetDemoAbCdEfGhIjKlMnOpQr',
      },
      {
        nom: 'Dossier Drive',
        url: 'https://drive.google.com/drive/folders/1DossierDemoZyXwVuTsRqPoNmL',
        idDrive: '1DossierDemoZyXwVuTsRqPoNmL',
      },
      { nom: 'TP2 ML.pdf', url: 'https://exemple.tn/cours/TP2%20ML.pdf' },
    ]);
  });
  it('liste chaque adresse une seule fois', () => {
    expect(adressesDuTexte('https://a.tn/x (https://a.tn/x)')).toEqual(['https://a.tn/x']);
  });
});
