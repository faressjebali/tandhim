/**
 * Page d'une matière : annonces Classroom, messages liés (mails, annonces lus par l'IA) et fichiers.
 */
import { and, desc, eq, or, sql } from 'drizzle-orm';
import type { Db } from './client';
import { classroomCourses, classroomPosts, sourceItems } from './schema';

export interface AnnonceMatiere {
  id: number;
  type: 'annonce' | 'support';
  titre: string | null;
  texte: string | null;
  lien: string | null;
  date: string;
  cours: string;
}

export interface MessageMatiere {
  id: number;
  source: 'gmail' | 'classroom' | 'drive' | 'messenger';
  sens: 'recu' | 'envoye';
  titre: string | null;
  expediteur: string | null;
  extrait: string;
  date: string;
  lien: string | null;
}

export interface FichierMatiere {
  nom: string;
  lien: string | null;
  date: string;
  /** D'où vient le fichier : « mail » ou « Classroom ». */
  origine: string;
}

export interface FicheMatiere {
  annonces: AnnonceMatiere[];
  messages: MessageMatiere[];
  fichiers: FichierMatiere[];
}

/** « Nom <adresse> » → « Nom » (ou l'adresse s'il n'y a pas de nom). */
export function nomExpediteur(entete: string | null): string | null {
  if (!entete) return null;
  const nom = entete
    .replace(/<[^>]*>/, '')
    .replace(/"/g, '')
    .trim();
  return nom || entete.replace(/[<>]/g, '').trim();
}

const lienFichier = (p: { type: string; id?: string }, lienMessage: string | null) =>
  (p.type === 'drive' || p.type === 'fichier_drive') && p.id
    ? `https://drive.google.com/file/d/${p.id}/view`
    : lienMessage;

export function ficheMatiere(
  db: Db,
  matiere: { id: number; code: string },
  limite = 30,
): FicheMatiere {
  const annonces = db
    .select({
      id: classroomPosts.id,
      type: classroomPosts.kind,
      titre: classroomPosts.title,
      texte: classroomPosts.text,
      lien: classroomPosts.link,
      date: classroomPosts.postedAt,
      cours: classroomCourses.name,
    })
    .from(classroomPosts)
    .innerJoin(classroomCourses, eq(classroomPosts.courseId, classroomCourses.id))
    .where(and(eq(classroomCourses.subjectId, matiere.id), eq(classroomCourses.followed, true)))
    .orderBy(desc(classroomPosts.postedAt))
    .limit(limite)
    .all();

  // Messages jugés pertinents par l'IA pour cette matière (ou venant d'un cours de la matière).
  const sources = db
    .select()
    .from(sourceItems)
    .where(
      and(
        eq(sourceItems.pertinent, true),
        or(
          eq(sourceItems.subjectHintId, matiere.id),
          sql`upper(json_extract(${sourceItems.analysis}, '$.matiere')) = ${matiere.code.toUpperCase()}`,
        ),
      ),
    )
    .orderBy(desc(sourceItems.sentAt))
    .limit(limite)
    .all();

  // Fichiers des dossiers Drive de la matière : tous, même ceux que l'IA n'a pas lus.
  const drive = db
    .select()
    .from(sourceItems)
    .where(and(eq(sourceItems.source, 'drive'), eq(sourceItems.subjectHintId, matiere.id)))
    .orderBy(desc(sourceItems.sentAt))
    .all();

  const messages: MessageMatiere[] = sources
    .filter((s) => s.source !== 'drive')
    .map((s) => ({
      id: s.id,
      source: s.source,
      sens: s.direction,
      titre: s.title,
      expediteur: nomExpediteur(s.sender),
      extrait: (s.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 220),
      date: s.sentAt,
      lien: s.link,
    }));

  const vus = new Set<string>();
  const fichiers: FichierMatiere[] = [
    ...drive,
    ...sources.filter((s) => s.source !== 'drive'),
  ].flatMap((s) =>
    s.attachments
      .filter((p) => p.type !== 'lien' && p.type !== 'video' && p.type !== 'formulaire')
      .filter((p) => {
        const cle = p.id ?? `${p.nom}-${s.id}`;
        if (vus.has(cle)) return false;
        vus.add(cle);
        return true;
      })
      .map((p) => ({
        nom: p.nom,
        lien: lienFichier(p, s.link),
        date: s.sentAt,
        origine:
          s.source === 'gmail'
            ? 'mail'
            : s.source === 'drive'
              ? 'Drive'
              : s.source === 'messenger'
                ? 'Messenger'
                : 'Classroom',
      })),
  );

  fichiers.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { annonces, messages, fichiers };
}
