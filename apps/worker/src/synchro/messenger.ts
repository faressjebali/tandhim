/**
 * Collecte Messenger (lecture seule) : le pont mautrix-meta recopie le groupe de la filière dans
 * un salon Matrix privé ; on le lit avec l'API client Matrix. Les messages sont regroupés en
 * tranches de conversation (le contexte compte), les sondages résumés avec leur décompte.
 */
import {
  type Env,
  type MessageLu,
  type SondageLu,
  decompterSondage,
  decouperEnTranches,
  formatTunis,
  lireEvenements,
  resumeSondage,
  signatureSondage,
  texteTranche,
  type EvenementMatrix,
} from '@tandhim/core';
import {
  type Db,
  ajouterSource,
  appliquerVotes,
  conversationsSansPassages,
  corrigerLiensMessenger,
  ecrireReglage,
  enregistrerPassages,
  enregistrerSondage,
  lireReglage,
  marquerSondageEnvoye,
  sondagesParId,
  syncEchouee,
  syncEnAttente,
  syncReussie,
} from '@tandhim/db';

const DELAI_MS = 60_000;
/** Premier passage : on remonte l'historique disponible (le pont en a gardé 300 messages). */
const PAGES_MAX = 20;
/** Au premier passage, seules les conversations récentes sont lues par l'IA. */
const ANALYSE_RECENTE_JOURS = 10;
/** Un sondage plus vieux n'est plus résumé pour l'IA. */
const SONDAGE_MAX_JOURS = 21;
/** Messages d'avant gardés comme contexte de la tranche suivante. */
const CONTEXTE = 5;
/** Résumé envoyé dès qu'il y a assez de votes pour dégager une tendance, ou à la clôture. */
const VOTES_MIN = 3;
/** Au-delà, l'absence totale de messages fait soupçonner une déconnexion du pont. */
const SILENCE_MAX_H = 30;
/** Conversations anciennes complétées par passage (rattrapage des messages exacts). */
const RATTRAPAGE_PAR_PASSAGE = 40;

interface ReponseMessages {
  chunk: EvenementMatrix[];
  start?: string;
  end?: string;
}

type ContexteStocke = { id: string; auteur: string; date: string; texte: string }[];

export async function synchroniserMessenger(
  db: Db,
  env: Env,
  log: (m: string) => void,
  options: { forcer?: boolean } = {},
) {
  if (!env.MATRIX_URL || !env.MATRIX_TOKEN || !env.MATRIX_SALONS) return;
  const salons = env.MATRIX_SALONS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const salon of salons) {
    const cle = `messenger:${salon}`;
    if (!options.forcer && syncEnAttente(db, cle)) continue;
    let libelle = 'Messenger';
    try {
      const api = async <T>(chemin: string, params: Record<string, string> = {}): Promise<T> => {
        const qs = new URLSearchParams(params).toString();
        const r = await fetch(
          `${env.MATRIX_URL}/_matrix/client/v3/rooms/${encodeURIComponent(salon)}${chemin}${qs ? `?${qs}` : ''}`,
          {
            headers: { Authorization: `Bearer ${env.MATRIX_TOKEN}` },
            signal: AbortSignal.timeout(DELAI_MS),
          },
        );
        const corps = (await r.json().catch(() => ({}))) as T & {
          errcode?: string;
          error?: string;
        };
        if (!r.ok)
          throw new Error(`Matrix ${r.status} ${corps.errcode ?? ''} ${corps.error ?? ''}`.trim());
        return corps;
      };

      const nomSalon = await api<{ name?: string }>('/state/m.room.name')
        .then((r) => r.name)
        .catch(() => undefined);
      libelle = `Messenger (${nomSalon ?? 'groupe'})`;
      const membres = await api<{ joined: Record<string, { display_name?: string }> }>(
        '/joined_members',
      );
      const nom = (id: string) => membres.joined[id]?.display_name ?? 'Membre du groupe';

      // --- Lecture des nouveaux événements --------------------------------------------------
      const cleJeton = `messenger.jeton.${salon}`;
      let jeton = lireReglage<string>(db, cleJeton);
      const premierPassage = !jeton;
      const evenements: EvenementMatrix[] = [];
      if (premierPassage) {
        let depuis: string | undefined;
        for (let p = 0; p < PAGES_MAX; p++) {
          const r = await api<ReponseMessages>('/messages', {
            dir: 'b',
            limit: '100',
            ...(depuis ? { from: depuis } : {}),
          });
          if (p === 0) jeton = r.start; // point de départ des lectures suivantes (vers l'avant)
          evenements.push(...r.chunk);
          if (!r.end || !r.chunk.length) break;
          depuis = r.end;
        }
      } else {
        for (let p = 0; p < PAGES_MAX; p++) {
          const r = await api<ReponseMessages>('/messages', {
            dir: 'f',
            limit: '100',
            from: jeton!,
          });
          evenements.push(...r.chunk);
          if (r.end) jeton = r.end;
          if (!r.end || r.chunk.length < 100) break;
        }
      }

      // Seuls les membres du groupe relayés par le pont comptent (pas le bot, pas le compte de lecture).
      const exclus = [
        ...new Set(evenements.map((e) => e.sender).filter((s) => !s.startsWith('@facebook_'))),
      ];
      const { messages, sondages, votes, fins } = lireEvenements(evenements, nom, exclus);

      // --- Sondages : cumul des votes, résumé quand le résultat change -----------------------
      for (const s of sondages) enregistrerSondage(db, salon, s);
      const touches = appliquerVotes(db, votes, fins);
      let resumes = 0;
      const limiteSondage = Date.now() - SONDAGE_MAX_JOURS * 86_400_000;
      for (const s of sondagesParId(db, [...new Set([...touches, ...sondages.map((x) => x.id)])])) {
        if (new Date(s.creeLe).getTime() < limiteSondage) continue;
        const lu: SondageLu = {
          id: s.eventId,
          auteur: s.auteur,
          date: new Date(s.creeLe),
          question: s.question,
          options: s.options,
        };
        const d = decompterSondage(
          lu,
          Object.entries(s.votes).map(([votant, v]) => ({
            sondageId: s.eventId,
            votant,
            date: new Date(v.date),
            choix: v.choix,
          })),
          s.clos,
        );
        const signature = signatureSondage(d);
        if (signature === s.signatureEnvoyee || (d.total < VOTES_MIN && !d.clos)) continue;
        ajouterSource(db, {
          source: 'messenger',
          externalId: `${salon}|sondage|${s.eventId}|${signature}`,
          sender: s.auteur,
          title: `Sondage : ${s.question}`,
          body: resumeSondage(lu, d),
          // Date du sondage : les jours relatifs (« lkhmis ») s'y rapportent.
          sentAt: s.creeLe,
          link: `https://app.element.io/#/room/${salon}/${s.eventId}`,
          attachments: [],
        });
        marquerSondageEnvoye(db, s.eventId, signature);
        resumes++;
      }

      // --- Rattrapage : messages des conversations enregistrées avant le 22/11/2026 -----------
      // (pour que « Ouvrir dans Element » pointe vers le message exact, pas le début).
      for (const conv of conversationsSansPassages(db, salon, RATTRAPAGE_PAR_PASSAGE)) {
        const idDebut = conv.externalId.slice(salon.length + 1);
        try {
          const ctx = await api<{ event?: EvenementMatrix; events_after?: EvenementMatrix[] }>(
            `/context/${encodeURIComponent(idDebut)}`,
            { limit: '80' },
          );
          const evs = [...(ctx.event ? [ctx.event] : []), ...(ctx.events_after ?? [])];
          const autres = [
            ...new Set(evs.map((e) => e.sender).filter((x) => !x.startsWith('@facebook_'))),
          ];
          const premiere = decouperEnTranches(lireEvenements(evs, nom, autres).messages)[0] ?? [];
          enregistrerPassages(
            db,
            conv.id,
            premiere.length
              ? premiere.map((m) => ({ id: m.id, texte: m.texte.slice(0, 600) }))
              : [{ id: idDebut, texte: '' }],
          );
        } catch (e) {
          log(`messenger : rattrapage impossible (${e instanceof Error ? e.message : String(e)})`);
          break;
        }
      }
      const corriges = corrigerLiensMessenger(db);
      if (corriges) log(`messenger : ${corriges} lien(s) de tâche vers le message exact`);

      // --- Messages : tranches de conversation, avec le contexte d'avant ---------------------
      // Le lancement d'un sondage fait partie de la conversation.
      const avecSondages: MessageLu[] = [
        ...messages,
        ...sondages.map((s) => ({
          id: s.id,
          auteur: s.auteur,
          date: s.date,
          texte: `lance un sondage : « ${s.question} » (options : ${s.options.map((o) => o.texte).join(' / ')})`,
          reponseA: null,
          modifie: false,
        })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime());

      const cleContexte = `messenger.contexte.${salon}`;
      let contexte: MessageLu[] = (lireReglage<ContexteStocke>(db, cleContexte) ?? []).map((m) => ({
        ...m,
        date: new Date(m.date),
        reponseA: null,
        modifie: false,
      }));
      const limiteAnalyse = Date.now() - ANALYSE_RECENTE_JOURS * 86_400_000;
      let tranches = 0;
      for (const tranche of decouperEnTranches(avecSondages)) {
        const debut = tranche[0]!;
        const ancien = premierPassage && debut.date.getTime() < limiteAnalyse;
        if (
          ajouterSource(db, {
            source: 'messenger',
            externalId: `${salon}|${debut.id}`,
            sender: [...new Set(tranche.map((m) => m.auteur))].slice(0, 6).join(', '),
            title: `${nomSalon ?? 'Groupe'} — ${formatTunis(debut.date, 'd MMM, HH:mm')}`,
            body: texteTranche(tranche, contexte),
            sentAt: debut.date.toISOString(),
            link: `https://app.element.io/#/room/${salon}/${debut.id}`,
            attachments: [],
            passages: tranche.map((m) => ({ id: m.id, texte: m.texte.slice(0, 600) })),
            ...(ancien
              ? {
                  status: 'ignore' as const,
                  error: 'conversation ancienne, gardée sans lecture par l’IA',
                }
              : {}),
          }) &&
          !ancien
        ) {
          tranches++;
        }
        contexte = tranche.slice(-CONTEXTE);
      }
      ecrireReglage(
        db,
        cleContexte,
        contexte.map((m) => ({
          id: m.id,
          auteur: m.auteur,
          date: m.date.toISOString(),
          texte: m.texte,
        })),
      );
      if (jeton) ecrireReglage(db, cleJeton, jeton);

      // Silence : le pont peut perdre Facebook sans que Matrix échoue. Le groupe écrit tous les
      // jours : plus de 30 h sans aucun message est suspect.
      const cleDernier = `messenger.dernier.${salon}`;
      const dernier = [...messages, ...sondages].reduce<Date | null>(
        (max, m) => (!max || m.date > max ? m.date : max),
        null,
      );
      if (dernier) ecrireReglage(db, cleDernier, dernier.toISOString());
      const connu = lireReglage<string>(db, cleDernier);
      if (connu) {
        const heures = (Date.now() - new Date(connu).getTime()) / 3_600_000;
        if (heures > SILENCE_MAX_H)
          syncEchouee(
            db,
            `messenger-silence:${salon}`,
            `${libelle} : réception`,
            `aucun message reçu depuis ${Math.round(heures)} h`,
          );
        else
          syncReussie(
            db,
            `messenger-silence:${salon}`,
            `${libelle} : réception`,
            'messages reçus récemment',
          );
      }

      syncReussie(
        db,
        cle,
        libelle,
        `${messages.length} message(s) lu(s), ${tranches} conversation(s) et ${resumes} sondage(s) à analyser`,
      );
      if (tranches || resumes)
        log(`${libelle} : ${tranches} conversation(s), ${resumes} sondage(s) à analyser`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      syncEchouee(
        db,
        cle,
        libelle,
        /M_UNKNOWN_TOKEN|401/.test(msg)
          ? `jeton Matrix refusé (${msg}) : refaire le jeton (docs/messenger)`
          : msg,
      );
      log(`${libelle} : ÉCHEC ${msg}`);
    }
  }
}
