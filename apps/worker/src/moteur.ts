/**
 * Moteur IA (SPEC §6) : analyse les éléments sources en attente (mails, annonces, supports)
 * par lots, puis crée ou met à jour les tâches. Respecte le quota Gemini gratuit.
 */
import { drive as driveApi } from '@googleapis/drive';
import { gmail as gmailApi } from '@googleapis/gmail';
import {
  type Element,
  type PieceJointe,
  QuotaAtteint,
  type SourceAAnalyser,
  analyserLot,
  construirePrompt,
} from '@tandhim/ai';
import {
  type CalendarData,
  type DayKey,
  type Env,
  appliquerGardeFous,
  creneauDuChangement,
  creneauPourHeure,
  daysBetween,
  formatTunis,
  idsDocumentsGoogle,
  prochaineSeance,
  resoudreEcheance,
  tunisDayKey,
  weekLabel,
} from '@tandhim/core';
import {
  type Db,
  type ResultatElement,
  type SourceItem,
  appliquerElement,
  compterSourcesEnAttente,
  enregistrerChangement,
  compterUsage,
  listSubjects,
  listerComptes,
  listerTaches,
  loadCalendarData,
  marquerSource,
  remettreEnFile,
  retirerTachesPerimees,
  sourcesATraiter,
  syncEchouee,
  syncEnAttente,
  syncReussie,
  usageDuJour,
} from '@tandhim/db';
import { DELAI_GOOGLE_MS, authCompte, messageErreur } from './synchro/google';

const CLE = 'ia';
const LIBELLE = 'Moteur IA (Gemini)';
const TAILLE_LOT = 6;
const LOTS_PAR_PASSAGE = 12;
const PDF_MAX_OCTETS = 4 * 1024 * 1024;
const PDF_MAX_PAR_LOT = 3;
const MARGE_QUOTA = 10;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TYPE_SOURCE = (s: SourceItem): SourceAAnalyser['type'] =>
  s.source === 'gmail'
    ? s.direction === 'envoye'
      ? 'mail envoyé par Fares'
      : 'mail reçu'
    : s.source === 'drive'
      ? 'fichier Drive'
      : s.source === 'messenger'
        ? s.externalId.includes('|sondage|')
          ? 'sondage Messenger'
          : 'messages Messenger'
        : s.externalId.startsWith('support:')
          ? 'support Classroom'
          : 'annonce Classroom';

/** Lit un fichier Drive (PDF, ou Google Doc/Slides exporté en PDF), en lecture seule. */
async function pdfDepuisDrive(
  auth: ReturnType<typeof authCompte>,
  fileId: string,
): Promise<Buffer | null> {
  const drive = driveApi({ version: 'v3', auth, timeout: DELAI_GOOGLE_MS });
  const { data: meta } = await drive.files.get({
    fileId,
    fields: 'mimeType,size',
    supportsAllDrives: true,
  });
  const opts = { responseType: 'arraybuffer' as const };
  if (meta.mimeType === 'application/pdf') {
    if (Number(meta.size ?? 0) > PDF_MAX_OCTETS) return null;
    const r = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, opts);
    return Buffer.from(r.data as ArrayBuffer);
  }
  if (meta.mimeType?.startsWith('application/vnd.google-apps.')) {
    const r = await drive.files.export({ fileId, mimeType: 'application/pdf' }, opts);
    const b = Buffer.from(r.data as ArrayBuffer);
    return b.length <= PDF_MAX_OCTETS ? b : null;
  }
  return null;
}

/**
 * Documents joints lus par Gemini avec le texte : PDF des mails reçus et fichiers Drive
 * des annonces / supports Classroom (plannings, énoncés…). Une pièce illisible est ignorée.
 */
/**
 * Documents à lire pour un élément : PDF joints à un mail reçu, fichiers Drive d'une annonce,
 * et documents Google cités par un lien dans le texte (Sheets, Docs, Slides, fichiers Drive).
 */
function documentsDe(s: SourceItem): { nom: string; type: string; taille: number; id: string }[] {
  if (s.source === 'gmail' && s.direction !== 'recu') return [];
  const joints = s.attachments.flatMap((p) =>
    p.id &&
    ((s.source === 'gmail' && p.type === 'application/pdf') ||
      ((s.source === 'classroom' || s.source === 'drive') && p.type === 'drive'))
      ? [{ ...p, id: p.id }]
      : [],
  );
  const dejaVus = new Set(joints.map((p) => p.id));
  const lies = idsDocumentsGoogle(s.body)
    .filter((id) => !dejaVus.has(id))
    .map((id) => ({ nom: 'document Google cité dans le message', type: 'drive', taille: 0, id }));
  return [...joints, ...lies];
}

const aDesDocuments = (s: SourceItem) => documentsDe(s).length > 0;

async function piecesPdf(db: Db, env: Env, lot: SourceItem[]): Promise<PieceJointe[]> {
  const comptes = new Map(listerComptes(db).map((c) => [c.id, c]));
  const pieces: PieceJointe[] = [];
  for (const s of lot) {
    const documents = documentsDe(s);
    if (!s.accountId || !documents.length) continue;
    const compte = comptes.get(s.accountId);
    if (!compte) continue;
    const auth = authCompte(env, compte.refreshTokenEnc);
    for (const p of documents) {
      if (pieces.length >= PDF_MAX_PAR_LOT) return pieces;
      try {
        let contenu: Buffer | null = null;
        if (s.source === 'gmail' && p.type === 'application/pdf') {
          if (p.taille > PDF_MAX_OCTETS) continue;
          const g = gmailApi({ version: 'v1', auth, timeout: DELAI_GOOGLE_MS });
          const { data } = await g.users.messages.attachments.get({
            userId: 'me',
            messageId: s.externalId,
            id: p.id,
          });
          contenu = data.data ? Buffer.from(data.data, 'base64url') : null;
        } else if (p.type === 'drive') {
          contenu = await pdfDepuisDrive(auth, p.id);
        }
        if (contenu) {
          pieces.push({
            sourceId: s.id,
            nom: p.nom,
            mime: 'application/pdf',
            base64: contenu.toString('base64'),
          });
        }
      } catch (e) {
        // Pièce illisible (droits, format) : le texte suffit, mais on le signale dans le journal.
        console.log(`[moteur] pièce « ${p.nom} » non lue : ${messageErreur(e)}`);
      }
    }
  }
  return pieces;
}

const LIEN_REUNION =
  /https:\/\/(?:meet\.google\.com|[\w.-]*teams\.microsoft\.com|[\w.-]*zoom\.us)\/[^\s>)"]+/;

/**
 * Échéance d'un élément : date écrite (ou jour relatif), sinon « pour la prochaine séance »
 * → début de la prochaine séance de la matière après le message.
 */
function echeanceDe(
  el: Element,
  subjectId: number | null,
  idVersCode: Map<number, string>,
  s: SourceItem,
  jourMessage: DayKey,
  calendrier: CalendarData,
): { echeance: Date; jourEntier: boolean } | null {
  const lue = resoudreEcheance(el.echeance, jourMessage);
  if (lue || !el.echeance?.prochaine_seance || !subjectId) return lue;
  const code = idVersCode.get(subjectId);
  const seance = code ? prochaineSeance(code, new Date(s.sentAt), calendrier) : undefined;
  return seance ? { echeance: seance.start, jourEntier: false } : null;
}

/** Code de réunion sans lien (« le code est : 564395061 », « abc-defg-hij ») : gardé tel quel. */
function codeReunion(texte: string | null | undefined): string | null {
  const t = texte?.replace(/^\s*code\s*(?:est)?\s*:?\s*/i, '').trim();
  return t && /^(?=.*\d|[a-z]{3}-[a-z]{4}-[a-z]{3}$)[\w-]{6,20}$/i.test(t) ? t : null;
}

/** Changement de séance (annulation, report, en ligne…) : rattaché au créneau de l'emploi du temps. */
function appliquerSeance(
  db: Db,
  s: SourceItem,
  el: Element,
  subjectId: number | null,
  idVersCode: Map<number, string>,
  jourMessage: DayKey,
  calendrier: CalendarData,
): ResultatElement {
  const code = subjectId ? idVersCode.get(subjectId) : undefined;
  if (!el.seance || !subjectId || !code) return 'info';
  const d = resoudreEcheance(el.seance.date, jourMessage);
  if (!d) return 'info';
  const jour = tunisDayKey(d.echeance);
  const nd = resoudreEcheance(el.seance.nouvelle_date, jourMessage);
  const nouveauJour = nd ? tunisDayKey(nd.echeance) : null;
  // Séance passée depuis plus d'une semaine : inutile pour le calendrier.
  const ilYA = daysBetween(
    nouveauJour && nouveauJour > jour ? nouveauJour : jour,
    tunisDayKey(new Date()),
  );
  if (ilYA > 7) return 'ignore';
  const heure = d.jourEntier ? null : formatTunis(d.echeance, 'HH:mm');
  const creneau = creneauDuChangement(jour, heure, code, calendrier);
  const nouvelleHeure = nd && !nd.jourEntier ? formatTunis(nd.echeance, 'HH:mm') : null;
  // Un rattrapage sans heure ne peut pas être placé dans la journée.
  if (el.seance.nature === 'rattrapage' && !creneau && !heure) return 'info';
  const lien =
    el.seance.lien?.match(LIEN_REUNION)?.[0] ??
    el.comment_details?.match(LIEN_REUNION)?.[0] ??
    (s.body ?? '').match(LIEN_REUNION)?.[0] ??
    codeReunion(el.seance.lien) ??
    codeReunion((s.body ?? '').match(/code[^\n]{0,15}?:\s*([\w-]{6,20})/i)?.[1]) ??
    null;
  const r = enregistrerChangement(db, {
    subjectId,
    jour,
    creneau,
    heure,
    nature: el.seance.nature,
    groupe: el.groupe,
    nouveauJour,
    nouveauCreneau: creneauPourHeure(nouvelleHeure),
    nouvelleHeure,
    lien,
    salle: el.seance.salle,
    sourceItemId: s.id,
    citation: el.citation,
    // Jour relatif ambigu (« vendredi jey » dit un samedi), ou changement connu seulement par
    // Messenger (source la moins fiable) : badge « à vérifier » jusqu'à confirmation écrite.
    confiance:
      d.ambigu || nd?.ambigu || s.source === 'messenger'
        ? Math.min(el.confiance, 0.5)
        : el.confiance,
  });
  return r === 'ignore' ? 'ignore' : 'seance';
}

export async function lancerMoteur(
  db: Db,
  env: Env,
  log: (m: string) => void,
  options: { forcer?: boolean } = {},
) {
  if (!env.GEMINI_API_KEY) return;
  const perimees = retirerTachesPerimees(db);
  if (perimees.length)
    log(`Moteur IA : ${perimees.length} tâche(s) périmée(s) retirée(s) : ${perimees.join(', ')}`);
  if (!options.forcer && syncEnAttente(db, CLE)) return;
  if (!compterSourcesEnAttente(db)) return;

  const bilan: Record<ResultatElement, number> = {
    cree: 0,
    maj: 0,
    confirme: 0,
    rendu: 0,
    seance: 0,
    info: 0,
    ignore: 0,
  };
  let analyses = 0;
  let nonPertinents = 0;

  for (let n = 0; n < LOTS_PAR_PASSAGE; n++) {
    const aujourdhui = tunisDayKey(new Date());
    if (usageDuJour(db, aujourdhui) >= env.GEMINI_RPD - MARGE_QUOTA) {
      log('Moteur IA : quota du jour presque atteint, reprise demain');
      break;
    }
    const candidats = sourcesATraiter(db, TAILLE_LOT);
    if (!candidats.length) break;
    // Un élément avec documents (planning, énoncé) est analysé seul, pour que l'IA les lise vraiment ;
    // les autres passent par lots (jusqu'au prochain élément avec documents).
    const premierAvecDocs = candidats.findIndex(aDesDocuments);
    const lot =
      premierAvecDocs === 0
        ? [candidats[0]!]
        : premierAvecDocs > 0
          ? candidats.slice(0, premierAvecDocs)
          : candidats;

    const matieres = listSubjects(db);
    const codeVersId = new Map(matieres.map((m) => [m.code.toUpperCase(), m.id]));
    const idVersCode = new Map(matieres.map((m) => [m.id, m.code]));
    const taches = listerTaches(db, { ouvertes: true });
    const calendrier = loadCalendarData(db);
    const prompt = construirePrompt({
      deleguee: env.TANDHIM_DELEGUEE,
      aujourdhui: formatTunis(new Date(), 'EEEE d MMMM yyyy'),
      semaine: weekLabel(aujourdhui, calendrier),
      matieres: matieres.map((m) => ({
        code: m.code,
        nom: m.name,
        enseignant: m.teacher,
        alias: m.aliases,
      })),
      taches: taches.map((t) => ({
        numero: t.id,
        titre: t.titre,
        matiere: t.matiere?.code ?? null,
        echeance: t.echeance ? formatTunis(t.echeance, 'EEEE d MMMM') : null,
        consignes: t.commentFaire,
      })),
      sources: lot.map((s) => ({
        id: s.id,
        type: TYPE_SOURCE(s),
        date: formatTunis(new Date(s.sentAt), "EEEE d MMMM yyyy 'à' HH:mm"),
        de: s.sender,
        a: s.recipients,
        titre: s.title,
        texte: s.body ?? '',
        pieces: s.attachments.map((p) => p.nom),
        matiereConnue: s.subjectHintId ? (idVersCode.get(s.subjectHintId) ?? null) : null,
      })),
    });

    try {
      const pieces = await piecesPdf(db, env, lot);
      // Documents (plannings en tableaux…) : modèle plus fort d'abord, Flash-Lite en secours.
      const modeles = pieces.length
        ? [env.GEMINI_DOCS_MODEL, env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL]
        : [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL];
      const { analyse } = await analyserLot(prompt, pieces, {
        apiKey: env.GEMINI_API_KEY,
        modeles,
        surConsommation: (modele, tokens) =>
          compterUsage(db, tunisDayKey(new Date()), modele, tokens),
      });
      const parId = new Map(analyse.resultats.map((r) => [r.id, r]));
      for (const s of lot) {
        const r = parId.get(s.id);
        if (!r) {
          remettreEnFile(db, s.id, 'absent de la réponse de l’IA');
          continue;
        }
        analyses++;
        if (!r.pertinent) {
          nonPertinents++;
          marquerSource(db, s.id, { status: 'ignore', pertinent: false, analysis: r });
          continue;
        }
        const jourMessage = tunisDayKey(new Date(s.sentAt));
        // Garde-fous du code (sondage ouvert, séance inchangée, date corrigée) : packages/core.
        const texteSource = `${s.title ?? ''}
${s.body ?? ''}`;
        const elements = r.elements.flatMap((el) => {
          const g = appliquerGardeFous(el, texteSource, jourMessage);
          return g ? [g] : [];
        });
        const resultats = elements.map((el) => {
          const code = (el.matiere ?? r.matiere)?.toUpperCase();
          const subjectId = (code ? codeVersId.get(code) : undefined) ?? s.subjectHintId ?? null;
          if (el.type === 'changement_seance' || el.type === 'seance_en_ligne') {
            const res = appliquerSeance(db, s, el, subjectId, idVersCode, jourMessage, calendrier);
            bilan[res]++;
            return res;
          }
          const res = appliquerElement(db, s, {
            type: el.type,
            titre: el.titre,
            quoi: el.quoi,
            modeComment: el.comment_mode,
            detailsComment: el.comment_details,
            importance: el.importance,
            confiance: el.confiance,
            citation: el.citation,
            concerne: el.concerne && /^\d+$/.test(el.concerne.trim()) ? Number(el.concerne) : null,
            subjectId,
            echeance: echeanceDe(el, subjectId, idVersCode, s, jourMessage, calendrier),
            groupe: el.groupe,
            remplace: el.remplace,
            aspects: el.aspects,
            projet: el.projet,
          });
          bilan[res]++;
          return res;
        });
        marquerSource(db, s.id, {
          status: 'traite',
          pertinent: true,
          analysis: { ...r, resultats },
        });
      }
    } catch (e) {
      const msg =
        e instanceof QuotaAtteint
          ? 'Quota Gemini atteint (429), nouvel essai plus tard'
          : messageErreur(e);
      for (const s of lot) remettreEnFile(db, s.id, msg);
      syncEchouee(db, CLE, LIBELLE, msg);
      log(`Moteur IA : ÉCHEC ${msg}`);
      return;
    }
    await pause(4_500); // ≤ 15 requêtes par minute (niveau gratuit)
  }

  const restants = compterSourcesEnAttente(db);
  const details = [
    `${analyses} élément(s) analysé(s) dont ${nonPertinents} sans rapport`,
    `${bilan.cree} tâche(s) créée(s)`,
    bilan.maj ? `${bilan.maj} mise(s) à jour` : '',
    bilan.rendu ? `${bilan.rendu} rendu(s) détecté(s)` : '',
    bilan.seance ? `${bilan.seance} changement(s) de séance` : '',
    restants ? `${restants} en attente` : '',
    `quota : ${usageDuJour(db, tunisDayKey(new Date()))}/${env.GEMINI_RPD} aujourd’hui`,
  ]
    .filter(Boolean)
    .join(', ');
  syncReussie(db, CLE, LIBELLE, details);
  log(`Moteur IA : ${details}`);
}
