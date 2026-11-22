import { describe, expect, it } from 'vitest';
import {
  type EvenementMatrix,
  corrigerEncodageMeta,
  decompterSondage,
  decouperEnTranches,
  lireEvenements,
  lireExportMeta,
  resumeSondage,
  signatureSondage,
  texteTranche,
} from './messenger';

// Heure de Tunis = UTC+1.
const t = (iso: string) => new Date(`${iso}+01:00`).getTime();
const noms: Record<string, string> = {
  '@facebook_1:tandhim': 'Nour',
  '@facebook_2:tandhim': 'Mehdi',
  '@facebook_3:tandhim': 'Khalil',
};
const nom = (u: string) => noms[u] ?? u;
const ev = (
  id: string,
  type: string,
  sender: string,
  iso: string,
  content: Record<string, unknown>,
) => ({ event_id: id, type, sender, origin_server_ts: t(iso), content }) as EvenementMatrix;

describe('lecture des événements Matrix', () => {
  it('messages, réponse, modification ; bot du pont et suppressions ignorés', () => {
    const r = lireEvenements(
      [
        ev('$1', 'm.room.message', '@facebook_1:tandhim', '2026-11-21T10:00:00', {
          msgtype: 'm.text',
          body: 'TP TNS ghodwa 8h',
        }),
        ev('$2', 'm.room.message', '@facebook_2:tandhim', '2026-11-21T10:02:00', {
          msgtype: 'm.text',
          body: '> <@facebook_1:tandhim> TP TNS ghodwa 8h\n\nen ligne ?',
          'm.relates_to': { 'm.in_reply_to': { event_id: '$1' } },
        }),
        ev('$3', 'm.room.message', '@facebook_1:tandhim', '2026-11-21T10:03:00', {
          msgtype: 'm.text',
          body: '* TP TNS ghodwa 9h45',
          'm.new_content': { msgtype: 'm.text', body: 'TP TNS ghodwa 9h45' },
          'm.relates_to': { rel_type: 'm.replace', event_id: '$1' },
        }),
        ev('$4', 'm.room.message', '@facebookbot:tandhim', '2026-11-21T10:04:00', {
          msgtype: 'm.notice',
          body: 'bridge info',
        }),
        {
          ...ev('$5', 'm.room.message', '@facebook_3:tandhim', '2026-11-21T10:05:00', {}),
          redacted_because: {},
        },
        ev('$6', 'm.room.message', '@facebook_3:tandhim', '2026-11-21T10:06:00', {
          msgtype: 'm.image',
          body: 'planning.jpg',
        }),
      ],
      nom,
      ['@facebookbot:tandhim'],
    );
    expect(r.messages.map((m) => [m.auteur, m.texte, m.modifie])).toEqual([
      ['Nour', 'TP TNS ghodwa 9h45', true],
      ['Mehdi', 'en ligne ?', false],
      ['Khalil', '[image : planning.jpg]', false],
    ]);
    expect(r.messages[1]?.reponseA).toEqual({ auteur: 'Nour', texte: 'TP TNS ghodwa 8h' });
  });

  it('sondage, votes et clôture', () => {
    const r = lireEvenements(
      [
        ev('$p', 'org.matrix.msc3381.poll.start', '@facebook_1:tandhim', '2026-11-18T09:00:00', {
          'org.matrix.msc3381.poll.start': {
            question: { 'org.matrix.msc1767.text': 'Rattrapage TNS ?' },
            answers: [
              { id: 'a', 'org.matrix.msc1767.text': 'Mardi 14h' },
              { id: 'b', 'org.matrix.msc1767.text': 'Jeudi 15h45' },
            ],
          },
        }),
        ev(
          '$v1',
          'org.matrix.msc3381.poll.response',
          '@facebook_2:tandhim',
          '2026-11-18T09:05:00',
          {
            'm.relates_to': { rel_type: 'm.reference', event_id: '$p' },
            'org.matrix.msc3381.poll.response': { answers: ['a'] },
          },
        ),
        ev('$f', 'org.matrix.msc3381.poll.end', '@facebook_1:tandhim', '2026-11-19T09:00:00', {
          'm.relates_to': { rel_type: 'm.reference', event_id: '$p' },
        }),
      ],
      nom,
    );
    expect(r.sondages[0]).toMatchObject({
      question: 'Rattrapage TNS ?',
      options: [
        { id: 'a', texte: 'Mardi 14h' },
        { id: 'b', texte: 'Jeudi 15h45' },
      ],
    });
    expect(r.votes).toHaveLength(1);
    expect(r.fins).toEqual(['$p']);
  });
});

describe('tranches de conversation', () => {
  const m = (iso: string, texte: string) => ({
    id: iso,
    auteur: 'Nour',
    date: new Date(`${iso}+01:00`),
    texte,
    reponseA: null,
    modifie: false,
  });
  it('coupure après 1 h de silence ou au changement de jour', () => {
    const tranches = decouperEnTranches([
      m('2026-11-21T10:00:00', 'a'),
      m('2026-11-21T10:50:00', 'b'),
      m('2026-11-21T12:10:00', 'c'),
      m('2026-11-21T23:50:00', 'd'),
      m('2026-11-22T00:10:00', 'e'),
    ]);
    expect(tranches.map((x) => x.map((y) => y.texte).join(''))).toEqual(['ab', 'c', 'd', 'e']);
  });
  it('texte : heure, auteur, contexte précédent', () => {
    const texte = texteTranche(
      [m('2026-11-21T10:50:00', 'TP annulé')],
      [m('2026-11-21T10:00:00', 'TP ghodwa ?')],
    );
    expect(texte).toContain('[10:00] Nour : TP ghodwa ?');
    expect(texte).toContain('Nouveaux messages :\n[10:50] Nour : TP annulé');
  });
});

describe('décompte des sondages', () => {
  const sondage = {
    id: '$p',
    auteur: 'Nour',
    date: new Date('2026-11-18T08:00:00Z'),
    question: 'Rattrapage TNS ?',
    options: [
      { id: 'a', texte: 'Mardi 14h' },
      { id: 'b', texte: 'Jeudi 15h45' },
    ],
  };
  const vote = (votant: string, minute: number, choix: string[]) => ({
    sondageId: '$p',
    votant,
    date: new Date(`2026-11-18T08:${String(minute).padStart(2, '0')}:00Z`),
    choix,
  });

  it('le dernier vote de chaque personne compte', () => {
    const d = decompterSondage(sondage, [
      vote('x', 1, ['a']),
      vote('y', 2, ['b']),
      vote('x', 3, ['b']), // x change d'avis
      vote('z', 4, ['a']),
      vote('w', 5, ['b']),
    ]);
    expect(d.options.map((o) => o.voix)).toEqual([1, 3]);
    expect(d.total).toBe(4);
    expect(d.enTete).toBe('b');
    expect(signatureSondage(d)).toBe('b');
  });

  it('égalité, clôture, résumé lisible', () => {
    const d = decompterSondage(sondage, [vote('x', 1, ['a']), vote('y', 2, ['b'])], true);
    expect(d.enTete).toBeNull();
    expect(signatureSondage(d)).toBe('egalite:clos');
    const r = resumeSondage(sondage, d);
    expect(r).toContain('« Rattrapage TNS ? »');
    expect(r).toContain('Mardi 14h (1 voix) ; Jeudi 15h45 (1 voix)');
    expect(r).toContain('Égalité. Sondage clos.');
  });
});

describe('sondage aux options écrites dans la question', () => {
  it('options retrouvées dans les lignes numérotées', () => {
    const r = lireEvenements(
      [
        ev('$q', 'org.matrix.msc3381.poll.start', '@facebook_1:tandhim', '2026-11-21T16:19:00', {
          'org.matrix.msc3381.poll.start': {
            question: {
              'org.matrix.msc1767.text': '* Seance ML 10/12 en ligne\n\n1. 18 h 30\n2. 21 h',
            },
            answers: [],
          },
        }),
      ],
      nom,
    );
    expect(r.sondages[0]).toMatchObject({
      question: 'Seance ML 10/12 en ligne',
      options: [
        { id: 'ligne-1', texte: '18 h 30' },
        { id: 'ligne-2', texte: '21 h' },
      ],
    });
  });
});

describe('export officiel Meta', () => {
  it('encodage corrigé (« Ã© » → « é »), arabe et ASCII laissés tels quels', () => {
    expect(corrigerEncodageMeta('SÃ©ance annulÃ©e')).toBe('Séance annulée');
    expect(corrigerEncodageMeta('ghodwa 8h')).toBe('ghodwa 8h');
    expect(corrigerEncodageMeta('لقد هرمنا')).toBe('لقد هرمنا');
    expect(corrigerEncodageMeta('Déjà correct')).toBe('Déjà correct');
  });

  it('messages remis dans l’ordre, médias, messages retirés et doublons', () => {
    const { titre, messages } = lireExportMeta([
      {
        title: 'Groupe de la filière',
        messages: [
          {
            sender_name: 'DÃ©lÃ©guÃ©e',
            timestamp_ms: t('2026-11-10T10:05:00'),
            content: 'DS le 27',
          },
          {
            sender_name: 'Ãtudiant',
            timestamp_ms: t('2026-11-10T10:00:00'),
            photos: [{ uri: 'x' }],
          },
          {
            sender_name: 'X',
            timestamp_ms: t('2026-11-10T10:01:00'),
            content: 'oups',
            is_unsent: true,
          },
        ],
      },
      {
        threadName: 'Groupe de la filière',
        messages: [
          { senderName: 'DÃ©lÃ©guÃ©e', timestamp: t('2026-11-10T10:05:00'), text: 'DS le 27' },
          { senderName: 'Y', timestamp: t('2026-11-09T09:00:00'), text: 'salut' },
        ],
      },
    ]);
    expect(titre).toBe('Groupe de la filière');
    expect(messages.map((m) => `${m.auteur}: ${m.texte}`)).toEqual([
      'Y: salut',
      'Étudiant: [image]',
      'Déléguée: DS le 27',
    ]);
  });
});
