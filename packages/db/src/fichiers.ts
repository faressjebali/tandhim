/**
 * Fichiers d'une tâche : tout ce qui la concerne, rassemblé depuis ses sources (pièces jointes
 * des mails, supports Classroom, fichiers Drive, documents Google cités dans les messages) et
 * depuis ses propres textes (description, consignes). Sans doublon.
 */
import { eq, inArray } from 'drizzle-orm';
import { fichiersDuTexte, passageDeLaCitation } from '@tandhim/core';
import type { Db } from './client';
import { consignes, itemSources, items, sourceItems } from './schema';

export interface FichierTache {
  nom: string;
  url: string;
  /** Pièce jointe d'un mail, lue dans l'app (relayée depuis Gmail). */
  interne: boolean;
  /** D'où vient le fichier (« mail du 15 nov. », « Classroom »…). */
  origine: string;
}

const ORIGINES: Record<string, string> = {
  gmail: 'Mail',
  classroom: 'Classroom',
  drive: 'Drive',
  messenger: 'Messenger',
};
const urlDrive = (id: string) => `https://drive.google.com/file/d/${id}/view`;

export function fichiersDeTache(db: Db, itemId: number): FichierTache[] {
  const tache = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!tache) return [];
  const liens = db
    .select({ sourceId: itemSources.sourceItemId, citation: itemSources.quote })
    .from(itemSources)
    .where(eq(itemSources.itemId, itemId))
    .all();
  const lesConsignes = db.select().from(consignes).where(eq(consignes.itemId, itemId)).all();
  const citations = new Map<number, string[]>();
  for (const l of liens)
    citations.set(l.sourceId, [...(citations.get(l.sourceId) ?? []), l.citation ?? '']);
  for (const c of lesConsignes)
    if (c.sourceItemId)
      citations.set(c.sourceItemId, [...(citations.get(c.sourceItemId) ?? []), c.texte]);
  const ids = [...citations.keys()];
  const sources = ids.length
    ? db.select().from(sourceItems).where(inArray(sourceItems.id, ids)).all()
    : [];

  const resultat: FichierTache[] = [];
  const vus = new Set<string>();
  // Noms connus des fichiers Drive (pour nommer un document cité seulement par son lien).
  const noms = new Map<string, string>();
  for (const s of sources) for (const p of s.attachments) if (p.id) noms.set(p.id, p.nom);
  const ajouter = (f: FichierTache, idDrive?: string) => {
    const cle = idDrive ?? f.url;
    if (vus.has(cle)) return;
    vus.add(cle);
    resultat.push(f);
  };

  for (const s of [...sources].sort((a, b) => b.sentAt.localeCompare(a.sentAt))) {
    const origine = ORIGINES[s.source] ?? 'Source';
    s.attachments.forEach((p, i) => {
      if (s.source === 'gmail' && p.id)
        ajouter({ nom: p.nom, url: `/api/sources/${s.id}/pieces/${i}`, interne: true, origine });
      else if ((p.type === 'drive' || p.type === 'fichier_drive') && p.id)
        ajouter({ nom: p.nom, url: urlDrive(p.id), interne: false, origine }, p.id);
      else if (p.url) ajouter({ nom: p.nom, url: p.url, interne: false, origine });
    });
    // Conversation Messenger : seulement les liens du message concerné, pas toute la conversation.
    const textes =
      s.source === 'messenger'
        ? (citations.get(s.id) ?? []).flatMap(
            (c) => passageDeLaCitation(s.passages, c)?.texte ?? [],
          )
        : [s.body ?? ''];
    for (const t of textes)
      for (const f of fichiersDuTexte(t))
        ajouter(
          {
            nom: (f.idDrive && noms.get(f.idDrive)) || f.nom,
            url: f.url,
            interne: false,
            origine,
          },
          f.idDrive,
        );
  }
  for (const t of [tache.description, tache.howTo, ...lesConsignes.map((c) => c.texte)])
    for (const f of fichiersDuTexte(t))
      ajouter(
        {
          nom: (f.idDrive && noms.get(f.idDrive)) || f.nom,
          url: f.url,
          interne: false,
          origine: 'Consigne',
        },
        f.idDrive,
      );
  return resultat;
}
