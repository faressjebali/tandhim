import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DbHandle, applySeed, openDb } from './index';
import { idDossierDrive } from './drive';
import { ficheMatiere, nomExpediteur } from './matieres';
import { runMigrations } from './migrate';
import { sourceItems, subjects } from './schema';

let dir: string;
let h: DbHandle;
let tns: { id: number; code: string };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-matiere-'));
  h = openDb(dir);
  runMigrations(h.db);
  applySeed(h.db);
  const s = h.db.select().from(subjects).where(eq(subjects.code, 'TNS')).get()!;
  tns = { id: s.id, code: s.code };
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const mail = (n: number, v: Partial<typeof sourceItems.$inferInsert>) =>
  h.db
    .insert(sourceItems)
    .values({
      source: 'gmail',
      externalId: `m${n}`,
      sentAt: `2026-11-1${n}T08:00:00Z`,
      sender: 'LEILA FERCHICHI <leila.ferchichi@exemple.tn>',
      title: `Mail ${n}`,
      body: 'Bonjour\n\n  à tous',
      link: `https://mail.google.com/x${n}`,
      status: 'traite',
      pertinent: true,
      ...v,
    })
    .run();

describe('fiche matière', () => {
  it('messages de la matière (selon l’IA), plus récents d’abord, et leurs fichiers sans doublon', () => {
    mail(1, {
      analysis: { matiere: 'TNS' },
      attachments: [{ nom: 'Eval.pdf', type: 'application/pdf', taille: 10, id: 'a1' }],
    });
    mail(2, {
      analysis: { matiere: 'tns' },
      attachments: [{ nom: 'Eval.pdf', type: 'application/pdf', taille: 10, id: 'a1' }],
    });
    mail(3, { analysis: { matiere: 'PRM' } });
    mail(4, { analysis: { matiere: 'TNS' }, pertinent: false });
    const f = ficheMatiere(h.db, tns);
    expect(f.messages.map((m) => m.titre)).toEqual(['Mail 2', 'Mail 1']);
    expect(f.messages[0]).toMatchObject({
      expediteur: 'LEILA FERCHICHI',
      extrait: 'Bonjour à tous',
    });
    expect(f.fichiers).toEqual([
      {
        nom: 'Eval.pdf',
        lien: 'https://mail.google.com/x2',
        date: '2026-11-12T08:00:00Z',
        origine: 'mail',
      },
    ]);
  });

  it('fichier Drive d’une annonce : lien direct vers Drive', () => {
    mail(5, {
      source: 'classroom',
      subjectHintId: tns.id,
      attachments: [{ nom: 'TP4.pdf', type: 'drive', taille: 0, id: 'drv' }],
    });
    expect(ficheMatiere(h.db, tns).fichiers[0]?.lien).toBe(
      'https://drive.google.com/file/d/drv/view',
    );
  });

  it('nom de l’expéditeur', () => {
    expect(nomExpediteur('"DVURE INSAT" <vie-etudiante@exemple.tn>')).toBe('DVURE INSAT');
    expect(nomExpediteur('<a@exemple.net>')).toBe('a@exemple.net');
  });
});

describe('fichiers Drive de la matière', () => {
  it('tous listés (même non lus par l’IA), sans apparaître dans les messages', () => {
    mail(6, {
      source: 'drive',
      subjectHintId: tns.id,
      title: 'Atelier 3.rar',
      status: 'ignore',
      pertinent: null,
      attachments: [{ nom: 'Atelier 3.rar', type: 'fichier_drive', taille: 10, id: 'rar1' }],
    });
    const f = ficheMatiere(h.db, tns);
    expect(f.fichiers[0]).toMatchObject({
      nom: 'Atelier 3.rar',
      origine: 'Drive',
      lien: 'https://drive.google.com/file/d/rar1/view',
    });
    expect(f.messages).toEqual([]);
  });
});

describe('lien de dossier Drive', () => {
  it('identifiant extrait du lien', () => {
    expect(
      idDossierDrive('https://drive.google.com/drive/u/1/folders/1DossierDeDemonstrationAbCdEfGh'),
    ).toBe('1DossierDeDemonstrationAbCdEfGh');
    expect(idDossierDrive('pas un lien')).toBeNull();
  });
});
