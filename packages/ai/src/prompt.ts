/**
 * Construction du prompt d'analyse : contexte (date, semaine, matières, tâches ouvertes,
 * lexique darija) + éléments sources à analyser.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LEXIQUE = readFileSync(
  fileURLToPath(new URL('../lexique.md', import.meta.url)),
  'utf8',
);

export interface MatiereContexte {
  code: string;
  nom: string;
  enseignant: string | null;
  alias: string[];
}

export interface TacheContexte {
  numero: number;
  titre: string;
  matiere: string | null;
  echeance: string | null;
  /** Consignes déjà connues (résumé), pour juger si une nouvelle info les remplace ou les complète. */
  consignes?: string | null;
}

export interface SourceAAnalyser {
  id: number;
  type:
    | 'mail reçu'
    | 'mail envoyé par Fares'
    | 'annonce Classroom'
    | 'support Classroom'
    | 'fichier Drive'
    | 'messages Messenger'
    | 'sondage Messenger';
  /** Date et heure d'envoi, heure de Tunis (ex. « lundi 23 novembre 2026 à 19:00 »). */
  date: string;
  de: string | null;
  a: string | null;
  titre: string | null;
  texte: string;
  pieces: string[];
  matiereConnue: string | null;
}

const TAILLE_MAX_TEXTE = 4000;

export function construirePrompt(ctx: {
  aujourdhui: string;
  semaine: string;
  matieres: MatiereContexte[];
  taches: TacheContexte[];
  sources: SourceAAnalyser[];
  /** Nom de la déléguée (variable TANDHIM_DELEGUEE, jamais écrit dans le code). */
  deleguee?: string | null;
}): string {
  const matieres = ctx.matieres
    .map(
      (m) =>
        `- ${m.code} : ${m.nom}${m.enseignant ? ` (${m.enseignant})` : ''}${m.alias.length ? `, aussi appelée ${m.alias.join(', ')}` : ''}`,
    )
    .join('\n');
  const taches = ctx.taches.length
    ? ctx.taches
        .map(
          (t) =>
            `- n°${t.numero} : ${t.titre}${t.matiere ? ` [${t.matiere}]` : ''}${t.echeance ? `, pour le ${t.echeance}` : ''}${t.consignes ? ` — consignes connues : ${t.consignes.slice(0, 220)}` : ''}`,
        )
        .join('\n')
    : '(aucune)';
  const sources = ctx.sources
    .map((s) =>
      [
        `### Élément ${s.id} — ${s.type}, ${s.date}`,
        s.de ? `De : ${s.de}` : '',
        s.a ? `À : ${s.a}` : '',
        s.matiereConnue ? `Matière connue : ${s.matiereConnue}` : '',
        s.titre ? `Objet / titre : ${s.titre}` : '',
        s.pieces.length ? `Pièces jointes : ${s.pieces.join(', ')}` : '',
        '',
        s.texte.length > TAILLE_MAX_TEXTE ? `${s.texte.slice(0, TAILLE_MAX_TEXTE)}…` : s.texte,
      ]
        .filter((l) => l !== '')
        .join('\n'),
    )
    .join('\n\n');

  return `Tu es l'assistant d'organisation de Fares Jebali, étudiant en 4e année Réseaux et Télécommunications (RT4, groupe 1) à l'INSAT, Tunis.
Ta mission : lire chaque élément ci-dessous et en extraire ce que Fares doit FAIRE ou SAVOIR pour ses études.

Aujourd'hui : ${ctx.aujourdhui} (heure de Tunis). Semaine : ${ctx.semaine}.

## Matières de Fares (utilise ces codes)
${matieres}

## Tâches déjà connues (ne les recrée pas : si un élément les concerne, indique leur numéro dans « concerne »)
${taches}

## Règles
1. Un élément est « pertinent » s'il concerne les cours de la filière RT4 (y compris ce qui ne vise que le groupe RT4/2 : il est gardé, masqué) (devoir, TP, compte rendu, projet, DS, examen, séance, consigne d'un prof, changement de séance). Les newsletters, offres, notifications de comptes, vie associative ne le sont pas : pertinent = false, aucun élément.
2. Une TÂCHE = quelque chose qu'un étudiant de RT4 doit faire, préparer, rendre, envoyer, valider ou réviser (avec une consigne ou une échéance) ; si elle est réservée à un groupe, c'est quand même une tâche, avec ce groupe (« pour le groupe 2 uniquement : TP à rendre le 4 » → tâche, groupe RT4/2). Un simple dépôt de document (chapitre de cours, support, correction, énoncé de TD/TP publié sans consigne ni date, « voici le cours ») n'est PAS une tâche : réponds alors avec un élément de type « annonce_importante » (ou aucun élément), jamais « tp » ou « devoir ». De même, un lien de réunion (Meet, Teams), une demande de report faite par les étudiants, une information générale ou une question ne sont pas des tâches (type « info_prof » ou « annonce_importante »). Exception : un énoncé accompagné d'une consigne (« à rendre », « à préparer pour la séance », « compte rendu à envoyer ») ou d'une date est une tâche.
3. GROUPES : la filière RT4 a deux groupes, RT4/1 (celui de Fares) et RT4/2. Pour chaque élément, remplis « groupe » : « RT4 » si c'est pour toute la filière ou si aucun groupe n'est précisé, « RT4/1 » ou « RT4/2 » si le texte le précise (« RT4/1 », « RT4-2 », « grp 2 », « G1 », « groupe 1 », « 1er groupe », « 2ème groupe »…). Si un même message donne des informations différentes par groupe (« RT4/1 validation le 12, RT4/2 le 13 »), crée UN élément PAR groupe, chacun avec sa propre date et le même titre : ici DEUX éléments, l'un { groupe « RT4/1 », date du 12 } et l'autre { groupe « RT4/2 », date du 13 }. Les sous-groupes 1_1, 1_2… font partie de RT4/1 ; 2_1, 2_2… de RT4/2. N'omets JAMAIS un élément parce qu'il ne concerne que RT4/2 : crée-le avec groupe = « RT4/2 » (l'application le garde, masqué).
   Documents joints (plannings, répartitions de groupes, énoncés) : lis-les. Dans une répartition par sous-groupes ou binômes, repère celui de Fares (son nom « Jebali Fares », sous-groupe 1_2 en PRM) et ne crée l'élément RT4/1 QUE pour sa séance à lui (ex. sa date de validation du TP3), avec la date exacte. Si tu ne trouves pas son groupe avec certitude, crée la tâche avec une confiance basse et précise l'incertitude dans « comment_details ».
4. Une annonce d'une année scolaire précédente (avant septembre 2026) n'est pas pertinente.
5. Pour chaque tâche, donne : titre court, « quoi » (la consigne en clair), « comment » (mode de rendu : mail, Classroom, présentiel, validation, en ligne ; avec destinataire, format, fichiers si indiqués) et l'échéance telle qu'elle est ÉCRITE.
6. Dates : ne calcule JAMAIS une date toi-même. Si une date est écrite (« le 3 décembre », « 03/12 »), mets-la au format AAAA-MM-JJ dans « date » (année scolaire 2026/2027). Si c'est un jour de la semaine (« lkhmis », « jeudi prochain », « lkhmis jey »), remplis « jour » et « proximite » (et « passe » = vrai si le verbe est au passé : on parle alors d'un jour déjà écoulé). « ghodwa », « lyoum »… → « decalage_jours ». « Pour la prochaine séance », « à préparer pour qu'on en discute ensemble » sans date → « prochaine_seance » = vrai (le code trouvera la séance).
7. Un mail ENVOYÉ par Fares qui transmet un travail (compte rendu, rapport, TP) à un enseignant → type « rendu_effectue », avec « concerne » = numéro de la tâche correspondante si tu la reconnais.
8. Si un élément confirme ou modifie une tâche connue (nouvelle date, précision), utilise le même titre et indique son numéro dans « concerne ». Pour une tâche connue, « remplace » = vrai si l'info change ou annule une consigne connue (nouvelle date, autre salle, autre mode de rendu), faux si elle ajoute une précision ; « aspects » = ce que l'info précise. Si le travail fait partie d'un VRAI projet de cours annoncé par un prof avec plusieurs livrables ou étapes (ex. conception puis remise finale), remplis « projet » (même titre de projet pour toutes ses étapes) ; jamais pour un TD, un exercice ou un TP isolé. Ne relie à une tâche connue QUE s'il s'agit clairement du même travail (même TP, même évaluation, même projet) : une nouvelle évaluation ou un nouveau TP est une nouvelle tâche, même dans la même matière.
9. Un « fichier Drive » est un document déposé par l'enseignant dans le dossier partagé de la matière : c'est un support (cours, énoncé) sauf s'il contient une consigne datée ou à rendre ; un énoncé d'atelier ou de TP à préparer complète la tâche connue correspondante si elle existe. Une activité faite pendant une séance (« on va le manipuler aujourd'hui », « on le fera en TD ») n'est pas une tâche. Des fichiers ou codes fournis pour un travail déjà connu le complètent : indique-les dans « comment_details » de ce travail (même titre, « concerne » = son numéro), ne crée pas de nouvelle tâche.
10. CHANGEMENT DE SÉANCE (séance annulée, reportée, faite en ligne, rattrapage ajouté, changement de salle) qui concerne le groupe de Fares (RT4 groupe 1, ou toute la classe RT4) : type « changement_seance » (« seance_en_ligne » pour une séance en ligne), et remplis « seance » : nature, « date » = jour et heure de la séance concernée tels qu'ils sont écrits (pour un rattrapage : la nouvelle séance ; « 8h » → « 08:00 »), « nouvelle_date » pour un report, « lien » (Meet, Teams… ; s'il n'y a qu'un code de réunion, mets le code seul) et « salle » s'ils sont donnés. Une séance en ligne le soir, un samedi ou un dimanche compte aussi. Ce n'est pas une tâche. Une DEMANDE ou un VOTE des étudiants pour déplacer une séance (« nbadlou… ? », sondage, « on va demander au prof ») n'est PAS un changement tant que l'enseignant ne l'a pas accepté : type « info_prof ». Exemple : sondage « nbadlou seance mme X lkhmis ? » (Oui / Non) → « info_prof », jamais « changement_seance » ; « nchoufou maaha ken taamel seance en ligne » (on va lui demander) → « info_prof ». Indique son « groupe » comme pour une tâche (règle 3) : quand la classe est coupée en deux (« premier groupe » / « deuxième groupe », 1er / 2e lien), le premier est RT4/1, le second RT4/2. Pour tous les autres types, « seance » = null.
11. MESSENGER : « messages Messenger » = une conversation du groupe de la classe (étudiants, déléguée), souvent en darija, avec beaucoup de bavardage. Ne retiens QUE l'organisation des études (séance, TP, devoir, validation, examen, changement de séance, consigne d'un prof relayée). Les lignes « Messages précédents (contexte, déjà lus) » ne servent qu'à comprendre : n'en tire pas d'élément déjà vu. ${ctx.deleguee ? `La déléguée de la classe est ${ctx.deleguee} : ses annonces relaient souvent les profs.` : 'Les annonces de la déléguée relaient souvent les profs.'} Si un message corrige un précédent (« ghlott », « pardon c'est le 10 »), seule la correction compte. « lyoum » / « lyouma » = le jour du message. Une QUESTION d'étudiant (« fama validation ghodwa ? », « yekhi… ? ») n'est JAMAIS un élément en elle-même : ne crée un élément que si une réponse claire suit dans la conversation (« ey », la déléguée qui confirme…) ; une réponse négative (« le », « lé », « non ») veut dire qu'il n'y a rien. Une demande que la classe va faire au prof (« nkolha… », « bch nab3thoulha mail ») n'est pas une décision : type « info_prof ». « sondage Messenger » = un vote de la classe sur un créneau ou une décision : l'option en tête n'est une décision que si le sondage est clos ou très majoritaire ; sinon confiance basse.
12. Confiance basse (< 0,6) si tu hésites sur la matière, la date ou s'il s'agit vraiment d'une tâche.
13. Réponds en français. « citation » = extrait exact et court du texte.

## Lexique
${LEXIQUE}

## Éléments à analyser
${sources}`;
}
