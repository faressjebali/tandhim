/**
 * Messages Messenger (reçus par le pont mautrix-meta dans un salon Matrix) : logique pure.
 * - lecture des événements Matrix : messages (modifications appliquées), sondages, votes ;
 * - découpage en tranches de conversation (le contexte compte : « ghodwa » seul ne dit rien) ;
 * - décompte des sondages (le dernier vote de chaque personne compte) et résumé pour l'IA.
 */
import { formatTunis, tunisDayKey } from './time';

/** Événement Matrix tel que renvoyé par l'API client (/messages). */
export interface EvenementMatrix {
  event_id: string;
  type: string;
  sender: string;
  origin_server_ts: number;
  content: Record<string, unknown>;
  redacted_because?: unknown;
}

export interface MessageLu {
  id: string;
  auteur: string;
  date: Date;
  texte: string;
  /** Message auquel celui-ci répond (texte court), s'il est connu. */
  reponseA: { auteur: string; texte: string } | null;
  modifie: boolean;
}

export interface SondageLu {
  id: string;
  auteur: string;
  date: Date;
  question: string;
  options: { id: string; texte: string }[];
}

export interface VoteLu {
  sondageId: string;
  votant: string;
  date: Date;
  choix: string[];
}

const SONDAGE_DEBUT = ['org.matrix.msc3381.poll.start', 'm.poll.start'];
const SONDAGE_VOTE = ['org.matrix.msc3381.poll.response', 'm.poll.response'];
const SONDAGE_FIN = ['org.matrix.msc3381.poll.end', 'm.poll.end'];

const texteDe = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o['org.matrix.msc1767.text'] === 'string') return o['org.matrix.msc1767.text'];
    if (typeof o.body === 'string') return o.body;
    const mtext = o['m.text'];
    if (Array.isArray(mtext) && typeof mtext[0]?.body === 'string') return mtext[0].body;
  }
  return '';
};

const relation = (c: Record<string, unknown>) =>
  (c['m.relates_to'] ?? {}) as {
    rel_type?: string;
    event_id?: string;
    'm.in_reply_to'?: { event_id?: string };
  };

/** Retire la citation de repli « > <@x> … » qu'ajoutent certains clients aux réponses. */
const sansCitation = (t: string) =>
  t
    .split('\n')
    .filter((l) => !l.startsWith('> '))
    .join('\n')
    .trim();

/**
 * Lit une suite d'événements (ordre chronologique). `nom` donne le nom affiché d'un membre ;
 * les événements de `exclus` (bot du pont, compte de l'app) sont ignorés.
 */
export function lireEvenements(
  evenements: EvenementMatrix[],
  nom: (userId: string) => string,
  exclus: string[] = [],
): { messages: MessageLu[]; sondages: SondageLu[]; votes: VoteLu[]; fins: string[] } {
  const messages: MessageLu[] = [];
  const parId = new Map<string, MessageLu>();
  const sondages: SondageLu[] = [];
  const votes: VoteLu[] = [];
  const fins: string[] = [];

  for (const e of [...evenements].sort((a, b) => a.origin_server_ts - b.origin_server_ts)) {
    if (exclus.includes(e.sender) || e.redacted_because) continue;
    const c = e.content ?? {};
    const rel = relation(c);
    const date = new Date(e.origin_server_ts);

    if (e.type === 'm.room.message') {
      // Modification : on remplace le texte du message d'origine s'il est déjà lu.
      if (rel.rel_type === 'm.replace' && rel.event_id) {
        const nouveau = texteDe(c['m.new_content']) || texteDe(c);
        const origine = parId.get(rel.event_id);
        if (origine) {
          origine.texte = sansCitation(nouveau.replace(/^\* /, ''));
          origine.modifie = true;
          continue;
        }
      }
      const corps = typeof c.body === 'string' ? c.body : '';
      const msgtype = typeof c.msgtype === 'string' ? c.msgtype : 'm.text';
      const texte =
        msgtype === 'm.text' || msgtype === 'm.notice' || msgtype === 'm.emote'
          ? sansCitation(corps.replace(/^\* /, ''))
          : `[${msgtype === 'm.image' ? 'image' : msgtype === 'm.file' ? 'fichier' : msgtype === 'm.video' ? 'vidéo' : msgtype === 'm.audio' ? 'message vocal' : 'pièce jointe'}${corps ? ` : ${corps}` : ''}]`;
      if (!texte) continue;
      const cible = rel['m.in_reply_to']?.event_id
        ? parId.get(rel['m.in_reply_to'].event_id)
        : undefined;
      const m: MessageLu = {
        id: e.event_id,
        auteur: nom(e.sender),
        date,
        texte,
        reponseA: cible ? { auteur: cible.auteur, texte: cible.texte.slice(0, 80) } : null,
        modifie: false,
      };
      messages.push(m);
      parId.set(m.id, m);
      continue;
    }

    if (SONDAGE_DEBUT.includes(e.type)) {
      const p = (c['org.matrix.msc3381.poll.start'] ?? c['m.poll'] ?? c['m.poll.start'] ?? {}) as {
        question?: unknown;
        answers?: { id?: string }[];
      };
      let question = (texteDe(p.question) || texteDe(c)).replace(/^\*\s*/, '');
      let options = (p.answers ?? []).flatMap((a) =>
        a.id ? [{ id: a.id, texte: texteDe(a) || a.id }] : [],
      );
      // Certains sondages arrivent avec les options écrites dans la question (« 1. 20 h »).
      if (!options.length) {
        const lignes = question.split('\n').map((l) => l.trim());
        const numerotees = lignes.flatMap((l) => {
          const m = /^(\d+)[.)]\s*(.+)$/.exec(l);
          return m ? [{ id: `ligne-${m[1]}`, texte: m[2]! }] : [];
        });
        if (numerotees.length) {
          options = numerotees;
          question = lignes.filter((l) => l && !/^\d+[.)]/.test(l)).join(' ');
        }
      }
      if (question || options.length) {
        sondages.push({ id: e.event_id, auteur: nom(e.sender), date, question, options });
      }
      continue;
    }

    if (SONDAGE_VOTE.includes(e.type) && rel.event_id) {
      const r = (c['org.matrix.msc3381.poll.response'] ??
        c['m.selections'] ??
        c['m.response'] ??
        {}) as { answers?: unknown } | unknown[];
      const choix = Array.isArray(r) ? r : Array.isArray(r.answers) ? r.answers : [];
      votes.push({
        sondageId: rel.event_id,
        votant: e.sender,
        date,
        choix: choix.filter((x): x is string => typeof x === 'string'),
      });
      continue;
    }

    if (SONDAGE_FIN.includes(e.type) && rel.event_id) fins.push(rel.event_id);
  }
  return { messages, sondages, votes, fins };
}

/**
 * Découpe en tranches de conversation : nouvelle tranche après un silence de `silenceMin`
 * minutes ou un changement de jour (heure de Tunis), pour que « ghodwa » garde son sens.
 */
export function decouperEnTranches(messages: MessageLu[], silenceMin = 60): MessageLu[][] {
  const tranches: MessageLu[][] = [];
  for (const m of messages) {
    const courante = tranches.at(-1);
    const dernier = courante?.at(-1);
    if (
      courante &&
      dernier &&
      m.date.getTime() - dernier.date.getTime() <= silenceMin * 60_000 &&
      tunisDayKey(m.date) === tunisDayKey(dernier.date)
    ) {
      courante.push(m);
    } else {
      tranches.push([m]);
    }
  }
  return tranches;
}

const ligne = (m: MessageLu) =>
  `[${formatTunis(m.date, 'HH:mm')}] ${m.auteur}${m.reponseA ? ` (en réponse à ${m.reponseA.auteur} : « ${m.reponseA.texte} »)` : ''} : ${m.texte}${m.modifie ? ' (modifié)' : ''}`;

/** Texte d'une tranche pour l'IA, avec quelques messages d'avant pour le contexte. */
export function texteTranche(tranche: MessageLu[], contexte: MessageLu[] = []): string {
  const avant = contexte.length
    ? `Messages précédents (contexte, déjà lus) :\n${contexte.map(ligne).join('\n')}\n\nNouveaux messages :\n`
    : '';
  return avant + tranche.map(ligne).join('\n');
}

export interface DecompteSondage {
  options: { id: string; texte: string; voix: number }[];
  total: number;
  /** Option en tête ; null s'il n'y a aucun vote ou en cas d'égalité. */
  enTete: string | null;
  clos: boolean;
}

/** Décompte : seul le dernier vote de chaque personne compte (on peut changer d'avis). */
export function decompterSondage(
  sondage: SondageLu,
  votes: VoteLu[],
  clos = false,
): DecompteSondage {
  const dernier = new Map<string, VoteLu>();
  for (const v of votes
    .filter((v) => v.sondageId === sondage.id)
    .sort((a, b) => a.date.getTime() - b.date.getTime())) {
    dernier.set(v.votant, v);
  }
  const voix = new Map(sondage.options.map((o) => [o.id, 0]));
  for (const v of dernier.values()) {
    for (const c of v.choix) if (voix.has(c)) voix.set(c, voix.get(c)! + 1);
  }
  const options = sondage.options.map((o) => ({ ...o, voix: voix.get(o.id) ?? 0 }));
  const max = Math.max(0, ...options.map((o) => o.voix));
  const premiers = options.filter((o) => o.voix === max);
  return {
    options,
    total: [...dernier.values()].filter((v) => v.choix.length).length,
    enTete: max > 0 && premiers.length === 1 ? premiers[0]!.id : null,
    clos,
  };
}

/** Résumé du sondage pour l'IA. */
export function resumeSondage(s: SondageLu, d: DecompteSondage): string {
  const options = d.options.map((o) => `${o.texte} (${o.voix} voix)`).join(' ; ');
  const tete = d.enTete ? d.options.find((o) => o.id === d.enTete)!.texte : null;
  return [
    `Sondage lancé par ${s.auteur} le ${formatTunis(s.date, "EEEE d MMMM 'à' HH:mm")} : « ${s.question} »`,
    `Options : ${options}`,
    `${d.total} votant(s). ${tete ? `En tête : ${tete}.` : d.total ? 'Égalité.' : 'Aucun vote pour l’instant.'} ${d.clos ? 'Sondage clos.' : 'Sondage encore ouvert.'}`,
  ].join('\n');
}

/** Signature du résultat : un nouveau résumé n'est envoyé à l'IA que si elle change. */
export const signatureSondage = (d: DecompteSondage) =>
  `${d.enTete ?? (d.total ? 'egalite' : 'aucun')}${d.clos ? ':clos' : ''}`;

// --- Export officiel Meta (« Télécharger vos informations », format JSON) ------------------

/**
 * Meta écrit l'UTF-8 octet par octet comme du Latin-1 (« Ã© » pour « é ») : on recode.
 * Un texte qui contient déjà des caractères hors Latin-1 (arabe, emoji corrects) est laissé tel quel.
 */
export function corrigerEncodageMeta(texte: string): string {
  const codes = Array.from(texte, (c) => c.codePointAt(0)!);
  if (!codes.some((c) => c >= 0x80) || codes.some((c) => c > 0xff)) return texte;
  const octets = Uint8Array.from(texte, (c) => c.charCodeAt(0));
  const recode = new TextDecoder('utf-8', { fatal: false }).decode(octets);
  // Si le recodage produit des caractères de remplacement, le texte n'était pas du mojibake.
  return recode.includes('�') ? texte : recode;
}

interface MessageExport {
  sender_name?: string;
  senderName?: string;
  timestamp_ms?: number;
  timestamp?: number;
  content?: string;
  text?: string;
  photos?: unknown[];
  videos?: unknown[];
  audio_files?: unknown[];
  files?: unknown[];
  media?: unknown[];
  share?: { link?: string };
  is_unsent?: boolean;
  isUnsent?: boolean;
}

interface FichierExport {
  title?: string;
  threadName?: string;
  messages?: MessageExport[];
}

/** Lit les fichiers message_N.json d'une conversation exportée (ancien et nouveau format). */
export function lireExportMeta(fichiers: unknown[]): {
  titre: string | null;
  messages: MessageLu[];
} {
  let titre: string | null = null;
  const vus = new Set<string>();
  const messages: MessageLu[] = [];
  for (const f of fichiers as FichierExport[]) {
    titre ??= f.title ?? f.threadName ?? null;
    for (const m of f.messages ?? []) {
      if (m.is_unsent || m.isUnsent) continue;
      const ts = m.timestamp_ms ?? m.timestamp;
      const auteurBrut = m.sender_name ?? m.senderName;
      if (!ts || !auteurBrut) continue;
      let texte = corrigerEncodageMeta(m.content ?? m.text ?? '').trim();
      if (!texte) {
        texte = m.photos?.length
          ? '[image]'
          : m.videos?.length
            ? '[vidéo]'
            : m.audio_files?.length
              ? '[message vocal]'
              : m.files?.length || m.media?.length
                ? '[fichier]'
                : m.share?.link
                  ? '[lien]'
                  : '';
      }
      if (!texte) continue;
      const auteur = corrigerEncodageMeta(auteurBrut);
      const cle = `${ts}|${auteur}|${texte}`;
      if (vus.has(cle)) continue; // même message présent dans deux fichiers
      vus.add(cle);
      messages.push({
        id: `export-${ts}-${messages.length}`,
        auteur,
        date: new Date(ts),
        texte,
        reponseA: null,
        modifie: false,
      });
    }
  }
  messages.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { titre: titre ? corrigerEncodageMeta(titre) : null, messages };
}
