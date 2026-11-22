/**
 * Collecte Gmail (lecture seule) : mails reçus de l'INSAT et mails envoyés à l'INSAT
 * (pour détecter les rendus). Chaque mail devient un élément source analysé par le moteur IA.
 */
import { gmail as gmailApi, type gmail_v1 } from '@googleapis/gmail';
import { type Env, destinataireSuivi, expediteurSuivi, requeteExpediteurs } from '@tandhim/core';
import {
  type Db,
  ajouterSource,
  dernierSucces,
  listerComptes,
  marquerCompte,
  schema,
  syncEchouee,
  syncEnAttente,
  syncProgres,
  syncReussie,
} from '@tandhim/db';
import { and, eq } from 'drizzle-orm';
import { DELAI_GOOGLE_MS, authCompte, estAccesRevoque, messageErreur } from './google';

// Expéditeurs suivis : profs, déléguée, DVURE, DEF (voir @tandhim/core expediteurs.ts).
const PREMIER_IMPORT_JOURS = 60;
/** Lectures par passage et pause entre deux lectures : reste sous le quota Gmail par minute. */
const MAX_PAR_PASSAGE = 150;
const PAUSE_LECTURE_MS = 250;
const TAILLE_MAX_TEXTE = 12_000;

const requeteRecus = (apres: number) =>
  `${requeteExpediteurs('from')} -in:sent -in:chats after:${apres}`;
const requeteEnvoyes = (apres: number) => `in:sent ${requeteExpediteurs('to')} after:${apres}`;

function decoder(data?: string | null): string {
  return data ? Buffer.from(data, 'base64url').toString('utf8') : '';
}

function texteDepuisHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Retire les citations de l'historique (« > … », « Le … a écrit : »). */
export function sansCitations(texte: string): string {
  const lignes: string[] = [];
  for (const l of texte.split('\n')) {
    if (/^(le|on) .{5,120}(a écrit|wrote)\s*:\s*$/i.test(l.trim())) break;
    if (/^-{2,}\s*(message d'origine|original message|forwarded)/i.test(l.trim())) break;
    if (!l.trimStart().startsWith('>')) lignes.push(l);
  }
  return lignes.join('\n').trim();
}

interface Partie {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; attachmentId?: string | null; size?: number | null } | null;
  parts?: Partie[] | null;
}

export function lireMessage(payload: Partie | undefined) {
  let texte = '';
  let html = '';
  const pieces: { nom: string; type: string; taille: number; id?: string }[] = [];
  const parcourir = (p?: Partie | null) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      pieces.push({
        nom: p.filename,
        type: p.mimeType ?? '',
        taille: p.body.size ?? 0,
        id: p.body.attachmentId,
      });
    } else if (p.mimeType === 'text/plain' && !texte) texte = decoder(p.body?.data);
    else if (p.mimeType === 'text/html' && !html) html = decoder(p.body?.data);
    for (const enfant of p.parts ?? []) parcourir(enfant);
  };
  parcourir(payload);
  const brut = texte || texteDepuisHtml(html);
  return { texte: sansCitations(brut).slice(0, TAILLE_MAX_TEXTE), pieces };
}

async function listerIds(g: gmail_v1.Gmail, q: string): Promise<string[]> {
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const { data } = await g.users.messages.list({
      userId: 'me',
      q,
      maxResults: 100,
      pageToken: page,
    });
    ids.push(...(data.messages ?? []).flatMap((m) => (m.id ? [m.id] : [])));
    page = data.nextPageToken ?? undefined;
  } while (page && ids.length < MAX_PAR_PASSAGE);
  return ids;
}

export async function synchroniserGmail(
  db: Db,
  env: Env,
  log: (m: string) => void,
  options: { forcer?: boolean } = {},
) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.ENCRYPTION_KEY) return;
  for (const compte of listerComptes(db)) {
    const cle = `gmail:${compte.id}`;
    const libelle = `Gmail (${compte.email})`;
    if (compte.status !== 'ok' || (!options.forcer && syncEnAttente(db, cle))) continue;
    try {
      const g = gmailApi({
        version: 'v1',
        auth: authCompte(env, compte.refreshTokenEnc),
        timeout: DELAI_GOOGLE_MS,
      });
      // Reprise : depuis le dernier passage COMPLET (moins 2 jours de marge), sinon 60 jours.
      // (Repartir du dernier mail enregistré perdrait les plus anciens d'un import interrompu.)
      const succes = dernierSucces(db, cle);
      const depuis = succes
        ? succes.getTime() - 2 * 86_400_000
        : Date.now() - PREMIER_IMPORT_JOURS * 86_400_000;
      const apres = Math.floor(depuis / 1000);

      let nouveaux = 0;
      let lus = 0;
      let incomplet = false;
      for (const [requete, direction] of [
        [requeteRecus(apres), 'recu'],
        [requeteEnvoyes(apres), 'envoye'],
      ] as const) {
        for (const id of await listerIds(g, requete)) {
          const existe = db
            .select({ id: schema.sourceItems.id })
            .from(schema.sourceItems)
            .where(
              and(eq(schema.sourceItems.source, 'gmail'), eq(schema.sourceItems.externalId, id)),
            )
            .get();
          if (existe) continue;
          if (lus >= MAX_PAR_PASSAGE) {
            incomplet = true;
            break;
          }
          lus++;
          await new Promise((r) => setTimeout(r, PAUSE_LECTURE_MS));
          const { data: m } = await g.users.messages.get({ userId: 'me', id, format: 'full' });
          const entete = (nom: string) =>
            m.payload?.headers?.find((h) => h.name?.toLowerCase() === nom)?.value ?? null;
          const { texte, pieces } = lireMessage(m.payload as Partie);
          const envoye = Number(m.internalDate ?? Date.now());
          // Double contrôle : la recherche Gmail est large (noms), le code tranche.
          const garde =
            direction === 'recu'
              ? expediteurSuivi(entete('from'))
              : destinataireSuivi([entete('to'), entete('cc')].filter(Boolean).join(', '));
          if (!garde) continue;
          if (
            ajouterSource(db, {
              source: 'gmail',
              accountId: compte.id,
              externalId: id,
              threadId: m.threadId ?? null,
              direction,
              sender: entete('from'),
              recipients: [entete('to'), entete('cc')].filter(Boolean).join(', ') || null,
              title: entete('subject'),
              body: texte,
              sentAt: new Date(envoye).toISOString(),
              link: `https://mail.google.com/mail/?authuser=${encodeURIComponent(compte.email)}#all/${m.threadId ?? id}`,
              attachments: pieces,
            })
          ) {
            nouveaux++;
          }
        }
      }
      if (incomplet) {
        syncProgres(
          db,
          cle,
          libelle,
          `import en cours : ${nouveaux} mail(s) ajouté(s), la suite au prochain passage`,
        );
      } else {
        syncReussie(db, cle, libelle, `${nouveaux} nouveau(x) mail(s) de l’INSAT`);
      }
      if (nouveaux) log(`${libelle} : ${nouveaux} nouveau(x) mail(s)`);
    } catch (e) {
      const msg = messageErreur(e);
      if (estAccesRevoque(msg)) marquerCompte(db, compte.id, 'a_reconnecter');
      // Quota Gmail par minute dépassé : ce n'est pas une panne, la suite viendra au prochain passage.
      if (/quota exceeded|rate ?limit/i.test(msg)) {
        syncProgres(
          db,
          cle,
          libelle,
          'limite Gmail par minute atteinte, import repris au prochain passage',
        );
        continue;
      }
      syncEchouee(db, cle, libelle, msg);
      log(`${libelle} : ÉCHEC ${msg}`);
    }
  }
}
