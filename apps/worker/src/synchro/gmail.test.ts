import { describe, expect, it } from 'vitest';
import { lireMessage, sansCitations } from './gmail';

const b64 = (s: string) => Buffer.from(s).toString('base64url');

describe('lecture d’un mail', () => {
  it('préfère le texte brut, liste les pièces jointes', () => {
    const r = lireMessage({
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64('Bonjour,\nLe TP3 est à rendre jeudi.') } },
            { mimeType: 'text/html', body: { data: b64('<p>Bonjour</p>') } },
          ],
        },
        {
          mimeType: 'application/pdf',
          filename: 'TP3.pdf',
          body: { attachmentId: 'a1', size: 12345 },
        },
      ],
    });
    expect(r.texte).toBe('Bonjour,\nLe TP3 est à rendre jeudi.');
    expect(r.pieces).toEqual([
      { nom: 'TP3.pdf', type: 'application/pdf', taille: 12345, id: 'a1' },
    ]);
  });

  it('convertit le HTML en texte quand il n’y a pas de version texte', () => {
    const r = lireMessage({
      mimeType: 'text/html',
      body: { data: b64('<div>Séance&nbsp;<b>annulée</b></div><br>Merci &amp; bon courage') },
    });
    expect(r.texte).toBe('Séance annulée\n\nMerci & bon courage');
  });

  it('retire l’historique cité', () => {
    expect(
      sansCitations(
        'Ci-joint mon CR.\n\nLe lun. 23 nov. 2026 à 10:00, Prof <p@exemple.tn> a écrit :\n> TP3 pour jeudi',
      ),
    ).toBe('Ci-joint mon CR.');
    expect(sansCitations('OK\n> ancien message\nmerci')).toBe('OK\nmerci');
  });
});
