#!/usr/bin/env node
/**
 * Contrôle des données personnelles (sans dépendance).
 *
 *   node infra/controle-donnees.mjs --commit            texte ajouté au commit en préparation
 *   node infra/controle-donnees.mjs --dossier <chemin>  tous les fichiers d'un dossier (vitrine)
 *
 * Deux familles de contrôles :
 *  1. Motifs connus : réseau Tailscale, identifiants Matrix, adresses personnelles ou de l'INSAT…
 *  2. Empreintes : hachages de vrais messages (Messenger, mails, annonces) et des noms des membres
 *     du groupe, calculés sur le serveur par `pnpm prive:empreintes` et rangés dans
 *     `.git/motifs-prives/` (jamais commité). Aucun texte réel n'est stocké en clair.
 *
 * Code de sortie 1 si quelque chose est trouvé (le commit ou la publication est bloqué).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const mode = args[0];
const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const dossierMotifs = process.env.TANDHIM_MOTIFS ?? join(racine, '.git', 'motifs-prives');

// --- Normalisation et empreintes (identiques à infra/empreintes-privees.sh) --------------------
export const normaliser = (t) =>
  t
    .replace(/https?:\/\/\S+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9؀-ۿ]+/)
    .filter(Boolean);
const empreinte = (mots) => createHash('sha256').update(mots.join(' ')).digest('hex').slice(0, 16);

const charger = (nom) => {
  const f = join(dossierMotifs, nom);
  return existsSync(f) ? new Set(readFileSync(f, 'utf8').split('\n').filter(Boolean)) : null;
};
const messages = charger('messages.txt'); // n-grammes de 5 et 8 mots
const noms = charger('noms.txt'); // paires de mots des noms (membres du groupe, profs en mode dossier)
const profs = mode === '--dossier' ? charger('profs.txt') : null;
// Identifiants personnels (adresses, comptes) : expressions locales, jamais écrites ici.
const personnels = [...(charger('motifs.txt') ?? [])].map((m) => new RegExp(m, 'i'));
const detail = process.env.TANDHIM_DETAIL === '1';

// Reformulations d'un vrai message : sacs de mots significatifs hachés (un par message) et mots
// rares. Une ligne qui partage au moins 4 mots avec un même message, dont 2 rares, est signalée
// (ex. une paraphrase qui garde les mots et les nombres d'origine dans un autre ordre).
const h8 = (m) => createHash('sha256').update(m).digest('hex').slice(0, 8);
const sacs = [...(charger('sacs.txt') ?? [])].map((l) => new Set(l.split(' ')));
const rares = charger('rares.txt') ?? new Set();
const parRare = new Map();
sacs.forEach((sac, i) => {
  for (const x of sac) if (rares.has(x)) parRare.set(x, [...(parRare.get(x) ?? []), i]);
});
const PARTAGES_MIN = 4;
const RARES_MIN = 2;

// --- Motifs connus ---------------------------------------------------------------------------
const MOTIFS = [
  [/tail[0-9a-f]{6}\.ts\.net/i, 'nom du réseau Tailscale'],
  [/!(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Z])[A-Za-z0-9]{18,}/, 'identifiant de salon Matrix'],
  [/\$[A-Za-z0-9_-]{40,}/, 'identifiant de message Matrix'],
  [/meet\.google\.com\/(?!abc-defg-hij)[a-z]{3}-[a-z]{4}-[a-z]{3}/, 'vrai lien Google Meet'],
  [/@facebook_\d{6,}/, 'identifiant Facebook relayé'],
];
// En mode dossier (vitrine publique) : aucune adresse ni aucun identifiant réel.
const MOTIFS_VITRINE = [
  [
    /[a-z0-9._%+-]+@(?!(example|exemple|demo)\.)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\b/i,
    'adresse email réelle',
  ],
  [/192\.168\.\d+\.\d+/, 'adresse IP locale'],
  // Outil d'assistance et son éditeur : jamais dans la vitrine (mots écrits en morceaux pour
  // ne pas déclencher le contrôle de commit local du dépôt privé).
  [new RegExp(['cl', 'aude', '|', 'anthr', 'opic'].join(''), 'i'), 'nom de l’outil d’assistance'],
  [/(folders|\/d)\/(?![A-Za-z0-9_-]*Demo)[A-Za-z0-9_-]{25,}/, 'identifiant de fichier Drive'],
];
// Adresses autorisées dans la vitrine (exemples, dépendances).
const ADRESSES_PERMISES = /noreply|users\.noreply\.github\.com|@example\.|@exemple\.|@demo\./i;

function controlerLigne(ligne, fichier, n, trouvailles) {
  const motifs = [
    ...MOTIFS,
    ...(mode === '--dossier' ? MOTIFS_VITRINE : []),
    ...personnels.map((re) => [re, 'identifiant personnel']),
  ];
  for (const [re, quoi] of motifs) {
    const m = re.exec(ligne);
    if (m && !(quoi === 'adresse email réelle' && ADRESSES_PERMISES.test(m[0])))
      trouvailles.push({ fichier, n, quoi, extrait: m[0] });
  }
  const mots = normaliser(ligne);
  if (messages) {
    trouve: for (const t of [5, 8])
      for (let i = 0; i + t <= mots.length; i++)
        if (messages.has(empreinte(mots.slice(i, i + t)))) {
          // TANDHIM_DETAIL=1 : montre les mots en cause (dans ton terminal uniquement).
          const extrait = detail ? mots.slice(i, i + t).join(' ') : '(masqué)';
          trouvailles.push({ fichier, n, quoi: 'extrait d’un vrai message', extrait });
          break trouve;
        }
  }
  if (sacs.length) {
    const hachés = new Map(mots.map((m) => [h8(m), m]));
    const candidats = new Set([...hachés.keys()].flatMap((x) => parRare.get(x) ?? []));
    for (const i of candidats) {
      const communs = [...hachés.keys()].filter((x) => sacs[i].has(x));
      if (
        communs.length >= PARTAGES_MIN &&
        communs.filter((x) => rares.has(x)).length >= RARES_MIN
      ) {
        const extrait = detail ? communs.map((x) => hachés.get(x)).join(' ') : '(masqué)';
        trouvailles.push({ fichier, n, quoi: 'reformulation d’un vrai message', extrait });
        break;
      }
    }
  }
  for (const liste of [noms, profs].filter(Boolean)) {
    for (let i = 0; i + 2 <= mots.length; i++)
      if (liste.has(empreinte(mots.slice(i, i + 2)))) {
        trouvailles.push({
          fichier,
          n,
          quoi: liste === profs ? 'nom d’un enseignant réel' : 'nom d’un membre du groupe',
          extrait: detail ? mots.slice(i, i + 2).join(' ') : '(masqué)',
        });
        break;
      }
  }
}

const trouvailles = [];
// Fichiers où le dépôt privé garde volontairement des données réelles (jamais copiés en vitrine).
const EXEMPTES_COMMIT = [/^packages\/db\/src\/seed\//, /^docs\/(SPEC|DECISIONS)\.md$/];

if (mode === '--commit') {
  const diff = execFileSync(
    'git',
    ['diff', '--cached', '-U0', '--no-color', '--', '.', ':!pnpm-lock.yaml'],
    { encoding: 'utf8', maxBuffer: 1 << 28 },
  );
  let fichier = '';
  let n = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) fichier = l.slice(6);
    else if (l.startsWith('@@')) n = Number(/\+(\d+)/.exec(l)?.[1] ?? 0) - 1;
    else if (l.startsWith('+')) {
      n++;
      if (!EXEMPTES_COMMIT.some((r) => r.test(fichier)))
        controlerLigne(l.slice(1), fichier, n, trouvailles);
    }
  }
} else if (mode === '--dossier' && args[1]) {
  const base = args[1];
  const parcourir = (d) => {
    for (const e of readdirSync(d)) {
      if (e === '.git' || e === 'node_modules') continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (statSync(p).size < 5_000_000 && !/\.(png|jpe?g|gif|webp|ico|woff2?)$/i.test(e))
        readFileSync(p, 'utf8')
          .split('\n')
          .forEach((l, i) => controlerLigne(l, relative(base, p), i + 1, trouvailles));
    }
  };
  parcourir(base);
} else {
  console.error('Usage : controle-donnees.mjs --commit | --dossier <chemin>');
  process.exit(2);
}

if (!messages || !noms)
  console.error(
    `⚠ Empreintes absentes (${dossierMotifs}) : lance « pnpm prive:empreintes » pour un contrôle complet.`,
  );
if (trouvailles.length) {
  console.error(`✖ ${trouvailles.length} donnée(s) personnelle(s) ou réelle(s) trouvée(s) :`);
  for (const t of process.env.TANDHIM_TOUT === '1' ? trouvailles : trouvailles.slice(0, 50))
    console.error(`  ${t.fichier}:${t.n}  ${t.quoi}  ${t.extrait}`);
  process.exit(1);
}
console.log('✔ Aucune donnée personnelle trouvée.');
