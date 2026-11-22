/**
 * Collecte des dossiers Google Drive suivis (lecture seule), ex. le dossier partagé de Machine
 * Learning. Chaque fichier devient un élément source : listé sur la page de la matière ; les
 * nouveaux (ou modifiés) sont lus par le moteur IA pour repérer consignes et échéances.
 */
import { drive as driveApi, type drive_v3 } from '@googleapis/drive';
import type { Env } from '@tandhim/core';
import {
  type Db,
  type DossierDrive,
  ajouterSource,
  listerComptes,
  listerDossiersDrive,
  majDossierDrive,
  syncEchouee,
  syncEnAttente,
  syncReussie,
} from '@tandhim/db';
import { DELAI_GOOGLE_MS, authCompte, estAccesRevoque, messageErreur } from './google';

const DOSSIER = 'application/vnd.google-apps.folder';
const PROFONDEUR_MAX = 4;
/** Au premier passage, les fichiers plus anciens sont listés mais pas lus par l'IA. */
const ANCIEN_JOURS = 21;

/** Fichiers que Gemini sait lire (PDF, documents Google exportés en PDF). */
const lisible = (mime: string | null | undefined) =>
  mime === 'application/pdf' ||
  (!!mime?.startsWith('application/vnd.google-apps.') && mime !== DOSSIER);

interface Fichier {
  id: string;
  nom: string;
  chemin: string;
  mime: string;
  modifie: string;
  taille: number;
  lien: string | null;
}

async function listerRecursif(drive: drive_v3.Drive, dossierId: string): Promise<Fichier[]> {
  const fichiers: Fichier[] = [];
  const visiter = async (id: string, chemin: string, profondeur: number) => {
    let page: string | undefined;
    do {
      const { data } = await drive.files.list({
        q: `'${id}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink)',
        pageSize: 200,
        pageToken: page,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of data.files ?? []) {
        if (!f.id || !f.name) continue;
        const ici = chemin ? `${chemin}/${f.name}` : f.name;
        if (f.mimeType === DOSSIER) {
          if (profondeur < PROFONDEUR_MAX) await visiter(f.id, ici, profondeur + 1);
          continue;
        }
        fichiers.push({
          id: f.id,
          nom: f.name,
          chemin: ici,
          mime: f.mimeType ?? '',
          modifie: f.modifiedTime ?? new Date().toISOString(),
          taille: Number(f.size ?? 0),
          lien: f.webViewLink ?? null,
        });
      }
      page = data.nextPageToken ?? undefined;
    } while (page);
  };
  await visiter(dossierId, '', 0);
  return fichiers;
}

/** Trouve le compte qui a accès au dossier (fac ou perso). */
async function ouvrir(db: Db, env: Env, d: DossierDrive) {
  const comptes = listerComptes(db).filter((c) => c.status === 'ok');
  const ordre = [
    ...comptes.filter((c) => c.id === d.accountId),
    ...comptes.filter((c) => c.id !== d.accountId),
  ];
  let derniere: unknown = new Error('aucun compte Google connecté');
  for (const c of ordre) {
    const drive = driveApi({
      version: 'v3',
      auth: authCompte(env, c.refreshTokenEnc),
      timeout: DELAI_GOOGLE_MS,
    });
    try {
      const { data } = await drive.files.get({
        fileId: d.folderId,
        fields: 'name',
        supportsAllDrives: true,
      });
      return { drive, compte: c, nom: data.name ?? null };
    } catch (e) {
      derniere = e;
    }
  }
  throw derniere;
}

export async function synchroniserDrive(
  db: Db,
  env: Env,
  log: (m: string) => void,
  options: { forcer?: boolean } = {},
) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.ENCRYPTION_KEY) return;
  for (const d of listerDossiersDrive(db)) {
    const cle = `drive:${d.id}`;
    const libelle = `Drive (${d.nom ?? d.folderId})`;
    if (!options.forcer && syncEnAttente(db, cle)) continue;
    try {
      const { drive, compte, nom } = await ouvrir(db, env, d);
      const premierPassage = !d.lastSeenAt;
      const limiteAncien = Date.now() - ANCIEN_JOURS * 86_400_000;
      let nouveaux = 0;
      for (const f of await listerRecursif(drive, d.folderId)) {
        const ancien = premierPassage && new Date(f.modifie).getTime() < limiteAncien;
        // Un fichier modifié est relu : l'identifiant inclut la date de modification.
        const ajoute = ajouterSource(db, {
          source: 'drive',
          accountId: compte.id,
          externalId: `${f.id}@${f.modifie}`,
          sender: nom ? `Drive « ${nom} »` : 'Drive',
          title: f.nom,
          body: `Fichier ${premierPassage ? 'présent' : 'ajouté ou modifié'} dans le dossier Drive « ${nom ?? ''} »${d.nomMatiere ? ` (${d.nomMatiere})` : ''} : ${f.chemin}`,
          sentAt: f.modifie,
          link: f.lien,
          attachments: [
            {
              nom: f.nom,
              type: lisible(f.mime) ? 'drive' : 'fichier_drive',
              taille: f.taille,
              id: f.id,
            },
          ],
          subjectHintId: d.subjectId,
          ...(ancien
            ? { status: 'ignore' as const, error: 'fichier ancien, listé sans lecture par l’IA' }
            : {}),
        });
        if (ajoute && !ancien) nouveaux++;
      }
      majDossierDrive(db, d.id, {
        accountId: compte.id,
        nom,
        lastSeenAt: new Date().toISOString(),
      });
      syncReussie(db, cle, `Drive (${nom ?? d.folderId})`, `${nouveaux} nouveau(x) fichier(s)`);
      if (nouveaux) log(`${libelle} : ${nouveaux} nouveau(x) fichier(s)`);
    } catch (e) {
      const msg = messageErreur(e);
      syncEchouee(
        db,
        cle,
        libelle,
        estAccesRevoque(msg) || /not found/i.test(msg)
          ? `dossier inaccessible avec tes comptes Google (${msg})`
          : msg,
      );
      log(`${libelle} : ÉCHEC ${msg}`);
    }
  }
}
