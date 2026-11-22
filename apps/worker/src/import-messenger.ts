/**
 * Import de l'historique Messenger depuis l'export officiel Meta (JSON) : complète ce que le pont
 * n'a pas récupéré (avant son premier message). Lancé par `pnpm messenger:importer:serveur`.
 *
 *   node --import tsx src/import-messenger.ts <dossier de la conversation> [--essai]
 *
 * Doublons évités : seuls les messages ANTÉRIEURS au plus ancien message reçu par le pont sont
 * importés. Les 3 semaines d'avant sont lues par l'IA ; le reste est gardé sans lecture.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decouperEnTranches, formatTunis, lireExportMeta, texteTranche } from '@tandhim/core';
import { loadRepoEnv, resolveDataDir } from '@tandhim/core/node';
import { ajouterSource, openDb, schema } from '@tandhim/db';
import { and, eq, like, notLike, sql } from 'drizzle-orm';

const ANALYSE_JOURS = 21;

const [dossier] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const essai = process.argv.includes('--essai');
if (!dossier) {
  console.error('Usage : import-messenger.ts <dossier de la conversation> [--essai]');
  process.exit(1);
}
const env = loadRepoEnv();
const salon = env.MATRIX_SALONS?.split(',')[0]?.trim();
if (!salon) {
  console.error('✖ MATRIX_SALONS manquant : le salon du groupe doit être configuré.');
  process.exit(1);
}

// Tous les message_N.json (et .json des exports récents) du dossier, sous-dossiers compris.
const fichiers: string[] = [];
const parcourir = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) parcourir(p);
    else if (f.endsWith('.json')) fichiers.push(p);
  }
};
parcourir(dossier);
const { titre, messages } = lireExportMeta(
  fichiers.map((f) => JSON.parse(readFileSync(f, 'utf8')) as unknown),
);
console.log(
  `Export « ${titre ?? '?'} » : ${fichiers.length} fichier(s), ${messages.length} message(s).`,
);

const { db } = openDb(resolveDataDir(env.DATA_DIR));
const S = schema.sourceItems;
// Plus ancien message déjà reçu par le pont : tout ce qui est avant vient de l'export.
const plusAncien = db
  .select({ d: sql<string | null>`min(${S.sentAt})` })
  .from(S)
  .where(
    and(
      eq(S.source, 'messenger'),
      like(S.externalId, `${salon}|%`),
      notLike(S.externalId, '%|export|%'),
    ),
  )
  .get()?.d;
const limite = plusAncien ? new Date(plusAncien) : new Date();
const anterieurs = messages.filter((m) => m.date < limite);
console.log(
  `Pont : premier message le ${formatTunis(limite, "d MMMM yyyy 'à' HH:mm")} → ${anterieurs.length} message(s) plus anciens à importer.`,
);

const debutAnalyse = limite.getTime() - ANALYSE_JOURS * 86_400_000;
let ajoutes = 0;
let aLire = 0;
let contexte = [] as typeof anterieurs;
for (const tranche of decouperEnTranches(anterieurs)) {
  const debut = tranche[0]!;
  const lire = debut.date.getTime() >= debutAnalyse;
  if (!essai) {
    const ok = ajouterSource(db, {
      source: 'messenger',
      externalId: `${salon}|export|${debut.date.getTime()}`,
      sender: [...new Set(tranche.map((m) => m.auteur))].slice(0, 6).join(', '),
      title: `${titre ?? 'Groupe'} — ${formatTunis(debut.date, 'd MMM, HH:mm')} (export)`,
      body: texteTranche(tranche, contexte),
      sentAt: debut.date.toISOString(),
      link: null,
      attachments: [],
      ...(lire
        ? {}
        : { status: 'ignore' as const, error: 'historique ancien, gardé sans lecture par l’IA' }),
    });
    if (ok) {
      ajoutes++;
      if (lire) aLire++;
    }
  } else if (lire) {
    aLire++;
  }
  contexte = tranche.slice(-5);
}
console.log(
  essai
    ? `Essai : ${decouperEnTranches(anterieurs).length} conversation(s), dont ${aLire} à lire par l'IA. Rien n'a été écrit.`
    : `✔ ${ajoutes} conversation(s) importée(s), dont ${aLire} à lire par l'IA (les autres sont gardées).`,
);
