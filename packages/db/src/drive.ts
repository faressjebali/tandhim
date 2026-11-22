/**
 * Dossiers Google Drive suivis (lecture seule) : chaque fichier devient un élément source ;
 * les nouveaux sont lus par le moteur IA, tous sont listés sur la page de la matière.
 */
import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { dossiersDrive, subjects } from './schema';

export type DossierDrive = typeof dossiersDrive.$inferSelect;

/** Identifiant d'un dossier à partir de son lien (…/folders/<id>) ou de l'identifiant seul. */
export function idDossierDrive(lienOuId: string): string | null {
  const t = lienOuId.trim();
  const m = /\/folders\/([a-zA-Z0-9_-]{15,})/.exec(t) ?? /[?&]id=([a-zA-Z0-9_-]{15,})/.exec(t);
  if (m) return m[1]!;
  return /^[a-zA-Z0-9_-]{15,}$/.test(t) ? t : null;
}

export function ajouterDossierDrive(db: Db, folderId: string, subjectId: number | null): void {
  db.insert(dossiersDrive)
    .values({ folderId, subjectId })
    .onConflictDoUpdate({ target: dossiersDrive.folderId, set: { subjectId } })
    .run();
}

export function supprimerDossierDrive(db: Db, id: number): void {
  db.delete(dossiersDrive).where(eq(dossiersDrive.id, id)).run();
}

export function listerDossiersDrive(db: Db) {
  return db
    .select({ d: dossiersDrive, matiere: subjects.code, nomMatiere: subjects.name })
    .from(dossiersDrive)
    .leftJoin(subjects, eq(dossiersDrive.subjectId, subjects.id))
    .all()
    .map((r) => ({ ...r.d, matiere: r.matiere, nomMatiere: r.nomMatiere }));
}

export function majDossierDrive(
  db: Db,
  id: number,
  v: { accountId?: number; nom?: string | null; lastSeenAt?: string },
): void {
  db.update(dossiersDrive).set(v).where(eq(dossiersDrive.id, id)).run();
}
