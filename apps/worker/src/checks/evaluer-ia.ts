/**
 * Évaluation de l'extraction IA (pnpm test:ai) : rejoue des cas connus et compare les éléments
 * trouvés (groupe, date, matière) à ceux attendus. Cas publics (inventés, versionnés) et cas privés
 * (vrais messages anonymisés, dossier exclu de Git) : packages/ai/jeu-de-test/.
 * Consomme le quota Gemini (un appel par lot de 6 cas).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type SourceAAnalyser, analyserLot, construirePrompt } from '@tandhim/ai';
import { appliquerGardeFous, formatTunis, resoudreEcheance, tunisDayKey } from '@tandhim/core';
import { findRepoRoot, loadRepoEnv, resolveDataDir } from '@tandhim/core/node';
import { listSubjects, openDb } from '@tandhim/db';

interface Attendu {
  groupe: string;
  date: string;
  matiere?: string;
}
interface Cas {
  id: string;
  type: SourceAAnalyser['type'];
  /** Date du message, heure de Tunis (AAAA-MM-JJTHH:MM). */
  date: string;
  de: string;
  titre: string;
  texte: string;
  attendu: Attendu[];
}

const env = loadRepoEnv();
if (!env.GEMINI_API_KEY) {
  console.error('✖ GEMINI_API_KEY manquante dans .env');
  process.exit(1);
}
const dossier = join(findRepoRoot(), 'packages/ai/jeu-de-test');
const lire = (f: string): Cas[] => JSON.parse(readFileSync(f, 'utf8')) as Cas[];
// `--cas id1,id2` : ne rejoue que ces cas (une requête par lot de 6).
const choisis = process.argv.includes('--cas')
  ? process.argv[process.argv.indexOf('--cas') + 1]?.split(',')
  : undefined;
const cas: Cas[] = [
  ...lire(join(dossier, 'cas-publics.json')),
  ...(existsSync(join(dossier, 'prive'))
    ? readdirSync(join(dossier, 'prive'))
        .filter((f) => f.endsWith('.json'))
        .flatMap((f) => lire(join(dossier, 'prive', f)))
    : []),
].filter((c) => !choisis || choisis.includes(c.id));

const { db } = openDb(resolveDataDir(env.DATA_DIR));
const matieres = listSubjects(db).map((m) => ({
  code: m.code,
  nom: m.name,
  enseignant: m.teacher,
  alias: m.aliases ?? [],
}));
const instant = (c: Cas) => new Date(`${c.date}:00+01:00`);

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : '—');
const essais = Math.max(1, Number(process.argv[process.argv.indexOf('--essais') + 1]) || 1);
const visible = (groupe: string) => groupe !== 'RT4/2';
const bilans: { rappel: number; precision: number; rappelVisible: number }[] = [];
for (let essai = 1; essai <= essais; essai++) {
  if (essais > 1)
    console.log(`
=== Essai ${essai}/${essais}`);
  let attendus = 0;
  let retrouves = 0;
  let attendusVisibles = 0;
  let retrouvesVisibles = 0;
  let produits = 0;
  let justes = 0;
  const echecs: string[] = [];

  for (let i = 0; i < cas.length; i += 6) {
    const lot = cas.slice(i, i + 6);
    const prompt = construirePrompt({
      deleguee: env.TANDHIM_DELEGUEE,
      // Chaque cas porte sa propre date ; « aujourd'hui » = la date du premier cas du lot.
      aujourdhui: formatTunis(instant(lot[0]!), 'EEEE d MMMM yyyy'),
      semaine: '',
      matieres,
      taches: [],
      sources: lot.map((c, k) => ({
        id: k + 1,
        type: c.type,
        date: formatTunis(instant(c), "EEEE d MMMM yyyy 'à' HH:mm"),
        de: c.de,
        a: null,
        titre: c.titre,
        texte: c.texte,
        pieces: [],
        matiereConnue: null,
      })),
    });
    const { analyse, modele } = await analyserLot(prompt, [], {
      apiKey: env.GEMINI_API_KEY,
      modeles: [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL],
    });
    console.log(`(lot ${i / 6 + 1} : ${modele})`);
    lot.forEach((c, k) => {
      const r = analyse.resultats.find((x) => x.id === k + 1);
      // Les simples infos (annonce, info du prof) ne deviennent ni tâche ni changement : non comptées.
      // Mêmes garde-fous du code que le moteur (sondage ouvert, séance inchangée, date corrigée).
      const trouves = (r?.elements ?? [])
        .flatMap((el) => {
          const g = appliquerGardeFous(
            el,
            `${c.titre ?? ''}
${c.texte}`,
            tunisDayKey(instant(c)),
          );
          return g ? [g] : [];
        })
        .filter((el) => el.type !== 'info_prof' && el.type !== 'annonce_importante')
        .flatMap((el) => {
          const e = resoudreEcheance(el.seance?.date ?? el.echeance, tunisDayKey(instant(c)));
          return e
            ? [
                {
                  groupe: el.groupe,
                  date: tunisDayKey(e.echeance),
                  matiere: el.matiere ?? r?.matiere,
                },
              ]
            : [];
        });
      const ok = (a: Attendu, t: (typeof trouves)[number]) =>
        a.groupe === t.groupe &&
        a.date === t.date &&
        (!a.matiere || a.matiere.toUpperCase() === (t.matiere ?? '').toUpperCase());
      const manques = c.attendu.filter((a) => !trouves.some((t) => ok(a, t)));
      const enTrop = trouves.filter((t) => !c.attendu.some((a) => ok(a, t)));
      attendus += c.attendu.length;
      retrouves += c.attendu.length - manques.length;
      attendusVisibles += c.attendu.filter((a) => visible(a.groupe)).length;
      retrouvesVisibles += c.attendu.filter(
        (a) => visible(a.groupe) && !manques.includes(a),
      ).length;
      produits += trouves.length;
      justes += trouves.length - enTrop.length;
      const reussi = !manques.length && !enTrop.length;
      console.log(`${reussi ? '✔' : '✖'} ${c.id}`);
      if (!reussi) {
        const f = (x: { groupe: string; date: string; matiere?: string | null }) =>
          `${x.groupe} ${x.date} ${x.matiere ?? ''}`.trim();
        echecs.push(
          `${c.id} — manquants : [${manques.map(f).join(' | ')}] ; en trop : [${enTrop.map(f).join(' | ')}]` +
            (process.argv.includes('--detail')
              ? `
    réponse : pertinent=${r?.pertinent} ${JSON.stringify(r?.elements.map((e) => ({ type: e.type, groupe: e.groupe, titre: e.titre, echeance: e.echeance, seance: e.seance?.date, citation: e.citation })))}`
              : ''),
        );
      }
    });
  }

  console.log(
    `\nRappel (attendus retrouvés) : ${retrouves}/${attendus} (${pct(retrouves, attendus)})`,
  );
  console.log(
    `Rappel sur les groupes affichés (RT4, RT4/1) : ${retrouvesVisibles}/${attendusVisibles} (${pct(retrouvesVisibles, attendusVisibles)})`,
  );
  console.log(
    `Précision (éléments datés justes) : ${justes}/${produits} (${pct(justes, produits)})`,
  );
  if (echecs.length) console.log(`\nÀ regarder :\n- ${echecs.join('\n- ')}`);
  bilans.push({
    rappel: retrouves / (attendus || 1),
    precision: produits ? justes / produits : 1,
    rappelVisible: retrouvesVisibles / (attendusVisibles || 1),
  });
}

if (essais > 1) {
  type Cle = keyof (typeof bilans)[number];
  const moy = (k: Cle) =>
    `${Math.round((100 * bilans.reduce((a, b) => a + b[k], 0)) / bilans.length)} %`;
  const liste = (k: Cle) => bilans.map((b) => `${Math.round(100 * b[k])} %`).join(' · ');
  console.log(`\n=== Moyenne sur ${essais} essais`);
  console.log(`Précision : ${moy('precision')} (${liste('precision')})`);
  console.log(`Rappel : ${moy('rappel')} (${liste('rappel')})`);
  console.log(`Rappel groupes affichés : ${moy('rappelVisible')} (${liste('rappelVisible')})`);
}
