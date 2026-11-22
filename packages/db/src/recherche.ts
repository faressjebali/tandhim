/**
 * Recherche globale : matières, tâches, messages (mails, annonces), fichiers.
 * Les volumes sont petits (quelques centaines de lignes) : filtrage en mémoire, insensible aux
 * accents et à la casse, tous les mots doivent apparaître.
 */
import { desc, eq } from 'drizzle-orm';
import type { Db } from './client';
import { classroomCourses, classroomPosts, items, sourceItems, subjects } from './schema';
import { nomExpediteur } from './matieres';

export interface ResultatRecherche {
  type: 'matiere' | 'tache' | 'message' | 'fichier' | 'annonce';
  titre: string;
  /** Contexte affiché sous le titre (extrait, matière, date…). */
  detail: string | null;
  /** Lien interne (commence par /) ou externe. */
  lien: string | null;
  date: string | null;
}

export const normaliserRecherche = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');

/** Extrait d'environ 140 caractères autour du premier mot trouvé. */
function extrait(texte: string, mot: string): string {
  const plat = texte.replace(/\s+/g, ' ').trim();
  const i = normaliserRecherche(plat).indexOf(mot);
  if (i < 0) return plat.slice(0, 140);
  const debut = Math.max(0, i - 50);
  return (
    (debut > 0 ? '…' : '') + plat.slice(debut, debut + 140) + (plat.length > debut + 140 ? '…' : '')
  );
}

export function rechercher(db: Db, requete: string, parType = 8): ResultatRecherche[] {
  const mots = normaliserRecherche(requete)
    .split(/\s+/)
    .filter((m) => m.length >= 2);
  if (!mots.length) return [];
  // Chaque mot doit commencer un mot du texte (« ml » ne trouve pas « html »).
  const motifs = mots.map(
    (m) => new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  );
  const correspond = (...champs: (string | null | undefined)[]) => {
    const t = normaliserRecherche(champs.filter(Boolean).join(' '));
    return motifs.every((r) => r.test(t));
  };
  const resultats: ResultatRecherche[] = [];
  const garder = (liste: ResultatRecherche[]) => resultats.push(...liste.slice(0, parType));

  const matieres = db.select().from(subjects).all();
  const codeDe = new Map(matieres.map((m) => [m.id, m.code]));
  garder(
    matieres
      .filter((m) => correspond(m.code, m.name, m.teacher, (m.aliases ?? []).join(' ')))
      .map((m) => ({
        type: 'matiere',
        titre: m.name,
        detail: m.teacher,
        lien: `/matieres/${encodeURIComponent(m.code)}`,
        date: null,
      })),
  );

  garder(
    db
      .select()
      .from(items)
      .orderBy(desc(items.updatedAt))
      .all()
      .filter((t) => t.groupe !== 'RT4/2')
      .filter((t) =>
        correspond(t.title, t.description, t.howTo, t.subjectId ? codeDe.get(t.subjectId) : null),
      )
      .map((t) => ({
        type: 'tache',
        titre: t.title,
        detail:
          [t.subjectId ? codeDe.get(t.subjectId) : null, t.status === 'termine' ? 'terminée' : null]
            .filter(Boolean)
            .join(', ') || null,
        lien: `/taches/${t.id}`,
        date: t.dueAt,
      })),
  );

  const sources = db.select().from(sourceItems).orderBy(desc(sourceItems.sentAt)).all();
  garder(
    sources
      .filter((s) => s.pertinent !== false && correspond(s.title, s.body, s.sender))
      .map((s) => ({
        type: 'message',
        titre: s.title || 'Sans objet',
        detail: [nomExpediteur(s.sender), extrait(`${s.title ?? ''} ${s.body ?? ''}`, mots[0]!)]
          .filter(Boolean)
          .join(' : '),
        lien: s.link,
        date: s.sentAt,
      })),
  );

  const vus = new Set<string>();
  garder(
    sources.flatMap((s) =>
      s.attachments
        .filter((p) => !['lien', 'video', 'formulaire'].includes(p.type) && correspond(p.nom))
        .filter((p) => {
          const cle = p.id ?? p.nom;
          if (vus.has(cle)) return false;
          vus.add(cle);
          return true;
        })
        .map((p) => ({
          type: 'fichier' as const,
          titre: p.nom,
          detail: s.title,
          lien:
            p.type === 'drive' && p.id ? `https://drive.google.com/file/d/${p.id}/view` : s.link,
          date: s.sentAt,
        })),
    ),
  );

  garder(
    db
      .select({ p: classroomPosts, cours: classroomCourses.name })
      .from(classroomPosts)
      .innerJoin(classroomCourses, eq(classroomPosts.courseId, classroomCourses.id))
      .orderBy(desc(classroomPosts.postedAt))
      .all()
      .filter(({ p, cours }) => correspond(p.title, p.text, cours))
      .map(({ p, cours }) => ({
        type: 'annonce',
        titre: p.title || extrait(p.text ?? '', mots[0]!).slice(0, 80),
        detail: cours,
        lien: p.link,
        date: p.postedAt,
      })),
  );

  return resultats;
}
