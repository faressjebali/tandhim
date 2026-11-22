/**
 * Liens vers les sources et fichiers : message exact d'une conversation Messenger, fichiers cités
 * dans un texte (Google Docs/Sheets/Drive, pièces). Logique pure, testée.
 */

export interface Passage {
  id: string;
  texte: string;
}

const mots = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 2);

/**
 * Message d'une conversation qui contient le mieux la citation retenue par l'IA (mots en commun).
 * `undefined` si rien ne correspond clairement (au moins la moitié des mots de la citation).
 */
export function passageDeLaCitation(
  passages: Passage[],
  citation: string | null | undefined,
): Passage | undefined {
  const cherches = new Set(mots(citation ?? ''));
  if (!cherches.size || !passages.length) return undefined;
  let meilleur: { p: Passage; score: number } | undefined;
  for (const p of passages) {
    const presents = new Set(mots(p.texte));
    let communs = 0;
    for (const m of cherches) if (presents.has(m)) communs++;
    const score = communs / cherches.size;
    if (!meilleur || score > meilleur.score) meilleur = { p, score };
  }
  return meilleur && meilleur.score >= 0.5 ? meilleur.p : undefined;
}

/**
 * Lien Element vers le message exact (au lieu du début de la conversation). Le lien d'une
 * conversation finit par « /<identifiant du premier message> » : on le remplace.
 */
export function lienDuPassage(
  lien: string | null,
  passages: Passage[] | null | undefined,
  citation: string | null | undefined,
): string | null {
  if (!lien || !passages?.length) return lien;
  const p = passageDeLaCitation(passages, citation);
  if (!p) return lien;
  const m = /^(https:\/\/app\.element\.io\/#\/room\/[^/]+)\/[^/]+$/.exec(lien);
  return m ? `${m[1]}/${p.id}` : lien;
}

export interface FichierCite {
  nom: string;
  url: string;
  /** Pour retrouver le nom d'un fichier Drive connu. */
  idDrive?: string;
}

const GENRES: [RegExp, string][] = [
  [/docs\.google\.com\/spreadsheets\//, 'Google Sheets'],
  [/docs\.google\.com\/document\//, 'Google Docs'],
  [/docs\.google\.com\/presentation\//, 'Google Slides'],
  [/docs\.google\.com\/forms\/|forms\.gle\//, 'Formulaire Google'],
  [/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//, 'Dossier Drive'],
  [/drive\.google\.com\//, 'Fichier Drive'],
];
const EXTENSION = /\.(pdf|docx?|pptx?|xlsx?|csv|zip|rar|ipynb|txt|py|m)(?:[?#]|$)/i;

/** Adresses web d'un texte (ponctuation finale retirée). */
export function adressesDuTexte(texte: string | null | undefined): string[] {
  if (!texte) return [];
  const vues: string[] = [];
  for (const m of texte.matchAll(/https?:\/\/[^\s<>()"'«»]+/g)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, '');
    if (!vues.includes(url)) vues.push(url);
  }
  return vues;
}

/** Fichiers cités dans un texte : documents Google, Drive, ou adresse d'un fichier (.pdf…). */
export function fichiersDuTexte(texte: string | null | undefined): FichierCite[] {
  return adressesDuTexte(texte).flatMap((url) => {
    const genre = GENRES.find(([r]) => r.test(url))?.[1];
    if (genre) {
      const id =
        /\/d\/([a-zA-Z0-9_-]{20,})/.exec(url)?.[1] ??
        /[?&]id=([a-zA-Z0-9_-]{20,})/.exec(url)?.[1] ??
        /folders\/([a-zA-Z0-9_-]{20,})/.exec(url)?.[1];
      return [{ nom: genre, url, ...(id ? { idDrive: id } : {}) }];
    }
    if (EXTENSION.test(url)) {
      const nom = decodeURIComponent(url.split(/[?#]/)[0]!.split('/').pop() ?? url);
      return [{ nom, url }];
    }
    return [];
  });
}
