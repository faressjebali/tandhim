'use server';

import { revalidatePath } from 'next/cache';
import {
  ajouterDossierDrive,
  idDossierDrive,
  reglerCours,
  supprimerCompte,
  supprimerDossierDrive,
} from '@tandhim/db';
import { getDb } from '@/lib/db';
import { demanderSynchro } from '@/lib/google';

const entier = (f: FormData, k: string) => {
  const n = Number(f.get(k));
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function reglerCoursAction(f: FormData): Promise<void> {
  const id = entier(f, 'id');
  if (!id) return;
  reglerCours(getDb().db, id, {
    subjectId: entier(f, 'subjectId'),
    followed: f.get('followed') === 'on',
  });
  demanderSynchro();
  revalidatePath('/', 'layout');
}

export async function oublierCompte(f: FormData): Promise<void> {
  const id = entier(f, 'id');
  if (id) supprimerCompte(getDb().db, id);
  revalidatePath('/', 'layout');
}

export async function synchroniserMaintenant(): Promise<void> {
  demanderSynchro();
  revalidatePath('/plus/synchros');
}

export async function suivreDossierDrive(f: FormData): Promise<void> {
  const id = idDossierDrive(String(f.get('lien') ?? ''));
  if (!id) return;
  ajouterDossierDrive(getDb().db, id, entier(f, 'subjectId'));
  demanderSynchro();
  revalidatePath('/plus/comptes');
}

export async function retirerDossierDrive(f: FormData): Promise<void> {
  const id = entier(f, 'id');
  if (id) supprimerDossierDrive(getDb().db, id);
  revalidatePath('/plus/comptes');
}
