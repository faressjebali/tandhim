/**
 * Synchro Google Classroom (lecture seule) : cours, devoirs + état de rendu, annonces, supports.
 * Chaque compte est indépendant ; un échec est visible dans « État des synchros » avec backoff.
 */
import { classroom as classroomApi, type classroom_v1 } from '@googleapis/classroom';
import { OAuth2Client } from 'google-auth-library';
import { type Env, echeanceClassroom, estRendu } from '@tandhim/core';
import { dechiffrer } from '@tandhim/core/node';
import {
  type Db,
  ajouterSource,
  type ResultatDevoir,
  listerComptes,
  listerCours,
  majCours,
  majDevoir,
  majPost,
  marquerCompte,
  nettoyerClassroom,
  schema,
  syncEchouee,
  syncEnAttente,
  syncReussie,
} from '@tandhim/db';
import { eq } from 'drizzle-orm';
import { DELAI_GOOGLE_MS } from './google';

type Classroom = classroom_v1.Classroom;

/** Annonces et supports plus anciens ignorés par le moteur IA (couvre le semestre en cours). */
const ANCIENNETE_MAX_MS = 90 * 86_400_000;
const recent = (iso: string) => Date.now() - new Date(iso).getTime() <= ANCIENNETE_MAX_MS;

/** Noms des pièces jointes d'une annonce ou d'un support (fichiers Drive, liens, vidéos). */
type Piece = { nom: string; type: string; taille: number; id?: string; url?: string };

function piecesClassroom(materiaux: classroom_v1.Schema$Material[] | undefined): Piece[] {
  return (materiaux ?? []).flatMap((m): Piece[] => {
    if (m.driveFile?.driveFile?.title)
      return [
        {
          nom: m.driveFile.driveFile.title,
          type: 'drive',
          taille: 0,
          id: m.driveFile.driveFile.id ?? undefined,
        },
      ];
    if (m.link?.url)
      return [{ nom: m.link.title ?? m.link.url, type: 'lien', taille: 0, url: m.link.url }];
    if (m.youtubeVideo?.title)
      return [
        {
          nom: m.youtubeVideo.title,
          type: 'video',
          taille: 0,
          url: m.youtubeVideo.alternateLink ?? undefined,
        },
      ];
    if (m.form?.title)
      return [
        { nom: m.form.title, type: 'formulaire', taille: 0, url: m.form.formUrl ?? undefined },
      ];
    return [];
  });
}

/** Parcourt toutes les pages d'une liste de l'API. */
async function toutesLesPages<T>(
  appel: (pageToken?: string) => Promise<{ items: T[] | undefined; suivant?: string | null }>,
): Promise<T[]> {
  const tout: T[] = [];
  let page: string | undefined;
  for (let i = 0; i < 50; i++) {
    const { items, suivant } = await appel(page);
    tout.push(...(items ?? []));
    if (!suivant) break;
    page = suivant;
  }
  return tout;
}

function messageErreur(e: unknown): string {
  const err = e as {
    message?: string;
    response?: { data?: { error?: string | { message?: string } } };
  };
  const data = err.response?.data?.error;
  return (typeof data === 'string' ? data : data?.message) ?? err.message ?? String(e);
}

export async function synchroniserClassroom(
  db: Db,
  env: Env,
  log: (m: string) => void,
  options: { forcer?: boolean } = {},
): Promise<void> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.ENCRYPTION_KEY) {
    log('Classroom : configuration Google ou ENCRYPTION_KEY absente, synchro ignorée');
    return;
  }
  for (const compte of listerComptes(db)) {
    const cle = `classroom:${compte.id}`;
    const libelle = `Classroom (${compte.email})`;
    // Une synchro demandée par Fares passe outre l'attente du backoff.
    if (compte.status !== 'ok' || (!options.forcer && syncEnAttente(db, cle))) continue;
    try {
      const auth = new OAuth2Client({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      });
      auth.setCredentials({
        refresh_token: dechiffrer(compte.refreshTokenEnc, env.ENCRYPTION_KEY),
      });
      const api = classroomApi({ version: 'v1', auth, timeout: DELAI_GOOGLE_MS });
      const bilan = await synchroniserCompte(db, api, compte.id, log);
      syncReussie(db, cle, libelle, bilan);
      log(`${libelle} : ${bilan}`);
    } catch (e) {
      const msg = messageErreur(e);
      if (/invalid_grant|unauthorized_client|invalid_client/i.test(msg)) {
        marquerCompte(db, compte.id, 'a_reconnecter');
      }
      syncEchouee(db, cle, libelle, msg);
      log(`${libelle} : ÉCHEC ${msg}`);
    }
  }
}

async function synchroniserCompte(
  db: Db,
  api: Classroom,
  accountId: number,
  log: (m: string) => void,
): Promise<string> {
  const cours = await toutesLesPages(async (pageToken) => {
    const { data } = await api.courses.list({
      courseStates: ['ACTIVE'],
      studentId: 'me',
      pageToken,
      pageSize: 100,
    });
    return { items: data.courses, suivant: data.nextPageToken };
  });
  majCours(
    db,
    accountId,
    cours
      .filter((c) => c.id && c.name)
      .map((c) => ({ googleId: c.id!, name: c.name!, section: c.section, link: c.alternateLink })),
  );

  const suivis = listerCours(db).filter((c) => c.compte.id === accountId && c.cours.followed);
  const compteur: Record<ResultatDevoir, number> = {
    cree: 0,
    maj: 0,
    inchange: 0,
    ignore: 0,
    verrouille: 0,
  };
  let postsEnEchec = 0;
  const devoirsVus = new Set<string>();

  for (const { cours: c } of suivis) {
    const courseId = c.googleId;
    const devoirs = await toutesLesPages(async (pageToken) => {
      const { data } = await api.courses.courseWork.list({
        courseId,
        courseWorkStates: ['PUBLISHED'],
        pageToken,
        pageSize: 100,
      });
      return { items: data.courseWork, suivant: data.nextPageToken };
    });
    const rendus = await toutesLesPages(async (pageToken) => {
      const { data } = await api.courses.courseWork.studentSubmissions.list({
        courseId,
        courseWorkId: '-',
        userId: 'me',
        pageToken,
        pageSize: 100,
      });
      return { items: data.studentSubmissions, suivant: data.nextPageToken };
    });
    const etatParDevoir = new Map(rendus.map((r) => [r.courseWorkId, r.state]));
    const matiere = c.subjectId
      ? db.select().from(schema.subjects).where(eq(schema.subjects.id, c.subjectId)).get()
      : undefined;

    for (const w of devoirs) {
      if (!w.id) continue;
      devoirsVus.add(w.id);
      const e = echeanceClassroom(w.dueDate, w.dueTime);
      const r = majDevoir(
        db,
        {
          accountId,
          subjectId: c.subjectId,
          rendusSurClassroom: matiere?.submissionsViaClassroom ?? false,
        },
        {
          googleId: w.id,
          titre: w.title ?? '',
          description: w.description,
          echeance: e?.echeance ?? null,
          jourEntier: e?.jourEntier ?? true,
          lien: w.alternateLink,
          rendu: estRendu(etatParDevoir.get(w.id)),
        },
      );
      compteur[r]++;
    }

    // Annonces et supports : utiles mais pas critiques (un refus ne bloque pas les devoirs).
    try {
      const { data: a } = await api.courses.announcements.list({ courseId, pageSize: 30 });
      for (const p of a.announcements ?? []) {
        if (!p.id || !p.creationTime) continue;
        majPost(db, c.id, {
          googleId: p.id,
          kind: 'annonce',
          text: p.text,
          link: p.alternateLink,
          postedAt: p.creationTime,
        });
        // Aussi dans la file du moteur IA (consignes, deadlines, rendus annoncés dans le texte).
        if (recent(p.creationTime))
          ajouterSource(db, {
            source: 'classroom',
            accountId,
            externalId: `annonce:${p.id}`,
            sender: c.name,
            title: `Annonce : ${c.name}`,
            body: p.text ?? '',
            sentAt: p.creationTime,
            link: p.alternateLink ?? null,
            subjectHintId: c.subjectId,
            attachments: piecesClassroom(p.materials),
          });
      }
      const { data: m } = await api.courses.courseWorkMaterials.list({ courseId, pageSize: 30 });
      for (const p of m.courseWorkMaterial ?? []) {
        if (!p.id || !p.creationTime) continue;
        majPost(db, c.id, {
          googleId: p.id,
          kind: 'support',
          title: p.title,
          text: p.description,
          link: p.alternateLink,
          postedAt: p.creationTime,
        });
        if (recent(p.creationTime))
          ajouterSource(db, {
            source: 'classroom',
            accountId,
            externalId: `support:${p.id}`,
            sender: c.name,
            title: p.title ?? `Support : ${c.name}`,
            body: p.description ?? '',
            sentAt: p.creationTime,
            link: p.alternateLink ?? null,
            subjectHintId: c.subjectId,
            attachments: piecesClassroom(p.materials),
          });
      }
    } catch (e) {
      postsEnEchec++;
      log(`Classroom : annonces/supports de « ${c.name} » non lus (${messageErreur(e)})`);
    }
  }

  const retires = nettoyerClassroom(db, accountId, devoirsVus);

  return [
    `${cours.length} cours, ${suivis.length} suivis`,
    retires ? `${retires} devoir(s) retiré(s)` : '',
    `${compteur.cree} nouveau(x) devoir(s)`,
    compteur.maj ? `${compteur.maj} mis à jour` : '',
    postsEnEchec ? `annonces non lues pour ${postsEnEchec} cours` : '',
  ]
    .filter(Boolean)
    .join(', ');
}
