/**
 * Mode démo : remplit une base vide avec de fausses données réalistes (messages, tâches,
 * changements de séance, projets…), toutes inventées. Les dates sont placées autour du jour
 * de la démo pour que l'app ait toujours l'air « vivante ». Idempotent (une seule fois).
 */
import { eq } from 'drizzle-orm';
import {
  type DayKey,
  PROFS_DEMO,
  addDaysToKey,
  maintenantDemo,
  tunisDayKey,
  tunisInstantOn,
} from '@tandhim/core';
import type { Db } from './client';
import { recalculerRevisions } from './revisions';
import {
  changementsSeance,
  consignes,
  itemSources,
  items,
  projects,
  settings,
  sourceItems,
  subjects,
  syncStatus,
  timetableSlots,
} from './schema';

const CLE = 'demo.appliquee';
const SALON = '!salonDemo:demo';
const element = (id: string) => `https://app.element.io/#/room/${SALON}/${id}`;

/** Jour de semaine (1 = lundi … 7 = dimanche) d'un jour donné. */
const jourSemaine = (j: DayKey) => ((new Date(`${j}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
/** Prochain jour (à partir de `j`, inclus si `inclus`) qui tombe tel jour de semaine. */
function prochain(j: DayKey, jour: number, inclus = true): DayKey {
  for (let i = inclus ? 0 : 1; i < 14; i++) {
    const k = addDaysToKey(j, i);
    if (jourSemaine(k) === jour) return k;
  }
  return j;
}

export function appliquerDemo(db: Db, reel: Date = new Date()): boolean {
  if (db.select().from(settings).where(eq(settings.key, CLE)).get()) return false;
  const maintenant = maintenantDemo(reel);
  const auj = tunisDayKey(maintenant);
  const iso = (j: DayKey, h = '23:59') => tunisInstantOn(j, h).toISOString();
  const ilYa = (heures: number) =>
    new Date(maintenant.getTime() - heures * 3_600_000).toISOString();

  db.transaction((tx) => {
    // Enseignants inventés partout (matières et emploi du temps).
    const matieres = new Map(
      tx
        .select()
        .from(subjects)
        .all()
        .map((s) => [s.code, s.id]),
    );
    for (const [code, prof] of Object.entries(PROFS_DEMO)) {
      const id = matieres.get(code);
      if (!id) continue;
      tx.update(subjects).set({ teacher: prof }).where(eq(subjects.id, id)).run();
      tx.update(timetableSlots)
        .set({ teacher: prof })
        .where(eq(timetableSlots.subjectId, id))
        .run();
    }
    const m = (code: string) => matieres.get(code) ?? null;

    // --- Sources inventées ------------------------------------------------------------------
    const source = (s: typeof sourceItems.$inferInsert) =>
      tx
        .insert(sourceItems)
        .values({ status: 'traite', pertinent: true, ...s })
        .returning()
        .get();

    const mailML = source({
      source: 'gmail',
      externalId: 'demo-mail-ml',
      sender: 'Walid Trabelsi <w.trabelsi@exemple.tn>',
      recipients: 'TEL4 <tel4@exemple.tn>',
      title: 'Mini-projet Machine Learning : consignes',
      body:
        'Bonjour à tous,\n\nLe mini-projet se fait en binôme : classification d’images sur un jeu de données au choix.\n' +
        `1. Choix du sujet à m’envoyer par mail avant le ${addDaysToKey(auj, 3)}.\n` +
        '2. Rapport (PDF, 6 pages max) et notebook à déposer sur Classroom.\n' +
        '3. Soutenance de 10 minutes pendant la dernière séance de TP.\n\n' +
        'Le planning des soutenances : https://docs.google.com/spreadsheets/d/1PlanningDemoSoutenancesML000/edit\n\nCordialement',
      sentAt: ilYa(50),
      link: 'https://mail.google.com/mail/#all/demo',
      attachments: [
        {
          nom: 'Enonce-mini-projet-ML.pdf',
          type: 'application/pdf',
          taille: 182_000,
          url: 'https://example.com/demo/enonce-mini-projet-ml.pdf',
        },
      ],
      subjectHintId: m('ML'),
    });
    const annoncePRM = source({
      source: 'classroom',
      externalId: 'demo-classroom-prm',
      sender: 'Amel Gharbi',
      title: 'Validation TP3 PRM',
      body: `La validation du TP3 (handover LTE) aura lieu le ${prochain(auj, 3, false)} pendant la séance de TP. Préparez le compte rendu et les captures Wireshark.`,
      sentAt: ilYa(28),
      link: 'https://classroom.google.com/',
      attachments: [
        {
          nom: 'TP3-handover-LTE.pdf',
          type: 'drive',
          taille: 0,
          url: 'https://example.com/demo/tp3-handover.pdf',
        },
      ],
      subjectHintId: m('PRM'),
    });
    const passages = [
      { id: '$demo1', texte: 'chkoun aando el cours mtaa TNS lbereh ?' },
      {
        id: '$demo2',
        texte: `mme Ferchichi qalet l seance mtaa ${prochain(auj, 4, false)} en ligne, l lien fel classroom`,
      },
      { id: '$demo3', texte: 'w l compte rendu TP2 nabaathouh par mail qbal jemaa' },
      { id: '$demo4', texte: 'ok merci 🙏' },
    ];
    const convTNS = source({
      source: 'messenger',
      externalId: `${SALON}|$demo1`,
      sender: 'Étudiant A, Déléguée, Étudiant B',
      title: 'Groupe de la filière — hier, 18:02',
      body: passages
        .map(
          (p, i) =>
            `[18:0${i + 2}] ${['Étudiant A', 'Déléguée', 'Déléguée', 'Étudiant B'][i]} : ${p.texte}`,
        )
        .join('\n'),
      sentAt: ilYa(20),
      link: element('$demo1'),
      attachments: [],
      passages,
    });
    const mailDS = source({
      source: 'gmail',
      externalId: 'demo-mail-ds',
      sender: 'Direction des études <etudes@exemple.tn>',
      title: 'Calendrier des DS',
      body: `Le DS de Machine Learning aura lieu le ${prochain(addDaysToKey(auj, 10), 2)} à 9h00, amphi B. Durée : 1h30. Documents non autorisés.`,
      sentAt: ilYa(70),
      link: 'https://mail.google.com/mail/#all/demo-ds',
      attachments: [],
      subjectHintId: m('ML'),
    });
    const annonceDROIT = source({
      source: 'classroom',
      externalId: 'demo-classroom-droit',
      sender: 'Ons Mejri',
      title: 'Séance annulée',
      body: `Bonjour, la séance de droit du ${prochain(auj, 5)} est annulée. Elle sera rattrapée plus tard.`,
      sentAt: ilYa(6),
      link: 'https://classroom.google.com/',
      attachments: [],
      subjectHintId: m('DROIT'),
    });

    // --- Projets -----------------------------------------------------------------------------
    const projetML = tx
      .insert(projects)
      .values({
        title: 'Mini-projet Machine Learning',
        kind: 'cours',
        subjectId: m('ML'),
        description: 'Classification d’images en binôme : sujet, rapport, notebook et soutenance.',
        deadlineDate: addDaysToKey(auj, 18),
        source: 'ia',
        needsReview: true,
      })
      .returning()
      .get();
    tx.insert(projects)
      .values({
        title: 'Portfolio en ligne',
        kind: 'perso',
        description: 'Site personnel avec mes projets (dont Tandhim).',
        deadlineDate: addDaysToKey(auj, 30),
      })
      .run();

    // --- Tâches ------------------------------------------------------------------------------
    const tache = (
      t: Partial<typeof items.$inferInsert> & { title: string },
      lien?: { source: { id: number; link: string | null }; citation: string },
    ) => {
      const r = tx
        .insert(items)
        .values({
          source: lien ? 'ia' : 'manuel',
          sourceUrl: lien?.source.link ?? null,
          confidence: lien ? 90 : null,
          ...t,
        })
        .returning()
        .get();
      if (lien)
        tx.insert(itemSources)
          .values({
            itemId: r.id,
            sourceItemId: lien.source.id,
            role: 'creation',
            quote: lien.citation,
          })
          .run();
      return r;
    };

    tache(
      {
        title: 'Envoyer le choix du sujet (mini-projet ML)',
        type: 'devoir',
        subjectId: m('ML'),
        projectId: projetML.id,
        dueAt: iso(addDaysToKey(auj, 3)),
        importance: 'haute',
        howMode: 'mail',
        howTo: 'Par mail à l’enseignant, un seul mail par binôme.',
      },
      { source: mailML, citation: 'Choix du sujet à m’envoyer par mail' },
    );
    tache(
      {
        title: 'Rapport et notebook du mini-projet ML',
        type: 'projet',
        subjectId: m('ML'),
        projectId: projetML.id,
        dueAt: iso(addDaysToKey(auj, 14)),
        howMode: 'classroom',
        howTo: 'PDF de 6 pages maximum + notebook, déposés sur Classroom.',
      },
      {
        source: mailML,
        citation: 'Rapport (PDF, 6 pages max) et notebook à déposer sur Classroom',
      },
    );
    tache(
      {
        title: 'Soutenance du mini-projet ML',
        type: 'projet',
        subjectId: m('ML'),
        projectId: projetML.id,
        dueAt: iso(addDaysToKey(auj, 18), '14:00'),
        dueAllDay: false,
        howMode: 'presentiel',
      },
      { source: mailML, citation: 'Soutenance de 10 minutes pendant la dernière séance de TP' },
    );
    tache(
      {
        title: 'Validation TP3 PRM',
        type: 'validation',
        subjectId: m('PRM'),
        dueAt: iso(prochain(auj, 3, false), '14:00'),
        dueAllDay: false,
        importance: 'haute',
        howMode: 'validation',
        howTo: 'Compte rendu + captures Wireshark.',
      },
      { source: annoncePRM, citation: 'La validation du TP3 (handover LTE)' },
    );
    const crTNS = tache(
      {
        title: 'Compte rendu TP2 TNS',
        type: 'tp',
        subjectId: m('TNS'),
        dueAt: iso(prochain(auj, 5)),
        howMode: 'mail',
        needsReview: true,
        confidence: 55,
        niveauEcheance: 'messenger',
      },
      { source: convTNS, citation: 'l compte rendu TP2 nabaathouh par mail qbal jemaa' },
    );
    tx.insert(consignes)
      .values({
        itemId: crTNS.id,
        sourceItemId: convTNS.id,
        niveau: 'messenger',
        aspects: ['rendu', 'date'],
        texte:
          'Compte rendu à envoyer par mail avant vendredi (relayé dans le groupe, à vérifier).',
        dateInfo: ilYa(20),
        aVerifier: true,
        vue: false,
        notifier: true,
      })
      .run();
    tache(
      {
        title: 'DS Machine Learning',
        type: 'ds',
        subjectId: m('ML'),
        dueAt: iso(prochain(addDaysToKey(auj, 10), 2), '09:00'),
        dueAllDay: false,
        importance: 'haute',
        howMode: 'presentiel',
        howTo: 'Amphi B, 1h30, documents non autorisés.',
      },
      { source: mailDS, citation: 'Le DS de Machine Learning aura lieu' },
    );
    tache({
      title: 'Réviser les chapitres 3 et 4 de STR',
      subjectId: m('STR'),
      dueAt: iso(addDaysToKey(auj, 1)),
    });
    tache({
      title: 'Imprimer le CV pour le forum entreprises',
      dueAt: iso(auj, '18:00'),
      dueAllDay: false,
      importance: 'basse',
    });
    tache({
      title: 'Exercices de gestion financière (série 2)',
      subjectId: m('GF'),
      status: 'termine',
      completedAt: ilYa(30),
      dueAt: iso(addDaysToKey(auj, -1)),
    });

    // --- Changements de séance ---------------------------------------------------------------
    tx.insert(changementsSeance)
      .values([
        {
          subjectId: m('TNS')!,
          jour: prochain(auj, 4, false),
          creneau: 'C1',
          nature: 'en_ligne',
          lien: 'https://meet.google.com/abc-defg-hij',
          sourceItemId: convTNS.id,
          citation: passages[1]!.texte,
          confidence: 55,
        },
        {
          subjectId: m('DROIT')!,
          jour: prochain(auj, 5),
          creneau: 'C3',
          nature: 'annulee',
          sourceItemId: annonceDROIT.id,
          citation: 'la séance de droit est annulée',
          confidence: 95,
        },
        {
          subjectId: m('PRM')!,
          jour: prochain(auj, 3, false),
          creneau: 'C3',
          nature: 'changement_salle',
          salle: 'Amphi C',
          sourceItemId: annoncePRM.id,
          confidence: 90,
        },
      ])
      .run();

    // --- État des synchros : tout va bien, en démo ------------------------------------------
    const etats: [string, string][] = [
      ['classroom', 'Classroom'],
      ['gmail', 'Gmail'],
      ['drive', 'Drive'],
      ['messenger', 'Messenger (groupe de la filière)'],
      ['moteur', 'Moteur IA'],
    ];
    for (const [key, label] of etats)
      tx.insert(syncStatus)
        .values({ key, label, lastSuccessAt: ilYa(0.2), details: 'Mode démo : données fictives' })
        .onConflictDoNothing()
        .run();

    tx.insert(settings).values({ key: CLE, value: maintenant.toISOString() }).run();
  });
  recalculerRevisions(db, maintenant);
  return true;
}
