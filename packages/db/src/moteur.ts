/**
 * Moteur d'extraction, côté base : file des éléments sources, application des éléments
 * extraits par l'IA (création, fusion, rendu), historique, quota Gemini.
 */
import {
  type Aspect,
  conflitTitres,
  consigneANotifier,
  dateAcceptee,
  groupesCompatibles,
  lienDuPassage,
  niveauDeSource,
  normaliserGroupe,
  ressemblanceTitres,
} from '@tandhim/core';
import { enregistrerConsigne, resumeConsignes } from './consignes';
import { type ProjetAnnonce, rangerDansProjet } from './projets-ia';
import { and, asc, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import type { Db } from './client';
import { aiUsage, itemHistory, itemSources, items, sourceItems, subjects } from './schema';

type NouvelleSource = typeof sourceItems.$inferInsert;
export type SourceItem = typeof sourceItems.$inferSelect;

/** Ajoute un élément source s'il n'existe pas déjà (même source + même identifiant). */
export function ajouterSource(db: Db, s: NouvelleSource): boolean {
  return db.insert(sourceItems).values(s).onConflictDoNothing().run().changes > 0;
}

export function sourcesATraiter(db: Db, limite: number): SourceItem[] {
  return db
    .select()
    .from(sourceItems)
    .where(and(eq(sourceItems.status, 'a_traiter'), lt(sourceItems.attempts, 3)))
    .orderBy(asc(sourceItems.sentAt))
    .limit(limite)
    .all();
}

export function compterSourcesEnAttente(db: Db): number {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(sourceItems)
    .where(and(eq(sourceItems.status, 'a_traiter'), lt(sourceItems.attempts, 3)))
    .get()!.n;
}

export function marquerSource(
  db: Db,
  id: number,
  r: {
    status: SourceItem['status'];
    pertinent?: boolean | null;
    analysis?: unknown;
    error?: string | null;
  },
): void {
  db.update(sourceItems)
    .set({
      status: r.status,
      pertinent: r.pertinent ?? null,
      analysis: r.analysis ?? null,
      error: r.error ?? null,
      processedAt: new Date().toISOString(),
      attempts: sql`${sourceItems.attempts} + ${r.status === 'erreur' ? 1 : 0}`,
    })
    .where(eq(sourceItems.id, id))
    .run();
}

/** Après une erreur, un élément reste dans la file tant qu'il a moins de 3 essais. */
export function remettreEnFile(db: Db, id: number, erreur: string): void {
  db.update(sourceItems)
    .set({
      status: 'a_traiter',
      error: erreur.slice(0, 500),
      attempts: sql`${sourceItems.attempts} + 1`,
    })
    .where(eq(sourceItems.id, id))
    .run();
}

// --- Application d'un élément extrait --------------------------------------

export const TYPES_TACHE = [
  'devoir',
  'tp',
  'compte_rendu',
  'projet',
  'ds',
  'examen',
  'revision',
] as const;

export interface ElementApplique {
  type: string;
  titre: string;
  quoi: string;
  modeComment: string;
  detailsComment: string | null;
  importance: 'basse' | 'normale' | 'haute';
  confiance: number;
  citation: string;
  /** Numéro d'une tâche existante désignée par l'IA. */
  concerne: number | null;
  subjectId: number | null;
  /** ambigu : jour relatif à faire confirmer par Fares (ex. « vendredi jey » dit un samedi). */
  echeance: { echeance: Date; jourEntier: boolean; ambigu?: boolean } | null;
  /** Groupe concerné (RT4 par défaut) : RT4/2 est stocké mais masqué. */
  groupe?: 'RT4' | 'RT4/1' | 'RT4/2';
  /** L'info modifie ou annule ce qui était dit pour cette tâche (sinon elle complète). */
  remplace?: boolean;
  /** Ce que l'info précise : date, lieu, rendu, modalités, contenu. */
  aspects?: Aspect[];
  /** Projet de cours à plusieurs étapes auquel appartient ce travail (sinon absent). */
  projet?: ProjetAnnonce | null;
}

export type ResultatElement = 'cree' | 'maj' | 'confirme' | 'rendu' | 'seance' | 'info' | 'ignore';

const SEUIL_FUSION = 0.5;
const SEUIL_CONCERNE = 0.2;
const SEUIL_RENDU = 0.35;
const SEUIL_CONFIANCE = 0.6;
const JOUR_MS = 86_400_000;
const SANS_DATE_MAX_JOURS = 21;

const TYPE_ITEM: Record<string, (typeof items.$inferInsert)['type']> = {
  devoir: 'devoir',
  tp: 'tp',
  compte_rendu: 'devoir',
  projet: 'devoir',
  ds: 'ds',
  examen: 'examen',
  revision: 'revision',
  seance_en_ligne: 'seance_en_ligne',
};
const MODES = ['mail', 'classroom', 'presentiel', 'validation', 'en_ligne', 'autre'] as const;
type Mode = (typeof MODES)[number];
const mode = (m: string): Mode | null =>
  (MODES as readonly string[]).includes(m) ? (m as Mode) : null;

function lier(
  db: Db,
  itemId: number,
  sourceItemId: number,
  role: (typeof itemSources.$inferInsert)['role'],
  quote: string,
) {
  db.insert(itemSources)
    .values({ itemId, sourceItemId, role, quote: quote.slice(0, 300) })
    .onConflictDoNothing()
    .run();
}

function historiser(
  db: Db,
  itemId: number,
  field: string,
  avant: unknown,
  apres: unknown,
  sourceItemId: number,
) {
  db.insert(itemHistory)
    .values({
      itemId,
      field,
      oldValue: avant == null ? null : String(avant),
      newValue: apres == null ? null : String(apres),
      sourceItemId,
    })
    .run();
}

/** Tâche existante visée : désignée par l'IA, sinon titre le plus ressemblant dans la même matière. */
/** Seuls ces types de tâches peuvent être « rendus » (pas une séance, un DS ou un examen). */
const TYPES_RENDABLES = ['devoir', 'tp', 'tache'] as const;

function trouverCible(
  db: Db,
  el: ElementApplique,
  seuil: number,
  ouvertesSeulement: boolean,
  types?: readonly string[],
  /** Faux pour un rendu (mail de Fares) : le groupe n'y est pas précisé. */
  parGroupe = true,
) {
  const groupeEl = normaliserGroupe(el.groupe);
  const groupeOk = (g: string) => !parGroupe || groupesCompatibles(g, groupeEl);
  if (el.concerne) {
    const t = db.select().from(items).where(eq(items.id, el.concerne)).get();
    // Numéro désigné par l'IA : accepté sauf conflit évident de titres (atelier ≠ projet…).
    if (
      t &&
      (!ouvertesSeulement || t.status !== 'termine') &&
      (!types || types.includes(t.type)) &&
      groupeOk(t.groupe) &&
      !conflitTitres(t.title, el.titre) &&
      // Hors rendu, l'IA doit désigner un travail au titre proche (« Remise rapport conception »
      // n'est pas « Remise totale définitive du projet »).
      (!parGroupe || ressemblanceTitres(t.title, el.titre) >= SEUIL_CONCERNE)
    )
      return t;
  }
  const candidates = db
    .select()
    .from(items)
    .where(
      and(
        el.subjectId ? eq(items.subjectId, el.subjectId) : sql`${items.subjectId} is null`,
        ouvertesSeulement ? ne(items.status, 'termine') : undefined,
      ),
    )
    .all();
  let meilleure: { t: (typeof candidates)[number]; score: number } | null = null;
  for (const t of candidates) {
    if (types && !types.includes(t.type)) continue;
    if (!groupeOk(t.groupe)) continue;
    const score = ressemblanceTitres(t.title, el.titre);
    if (score >= seuil && (!meilleure || score > meilleure.score)) meilleure = { t, score };
  }
  return meilleure?.t;
}

/**
 * Applique un élément extrait d'une source. Règles :
 * - infos (annonce, info du prof, changement de séance) : gardées dans l'analyse, pas de tâche ;
 * - rendu effectué : la tâche visée passe « terminé » (sauf si Fares l'a modifiée) ;
 * - même travail déjà connu : fusion (échéance, consigne, mode de rendu), ancienne valeur historisée ;
 * - sinon création, avec badge « à vérifier » si l'IA doute ; échéances passées depuis > 7 j ignorées.
 * Une tâche modifiée par Fares (lockedByUser) n'est jamais changée : la source y est seulement liée.
 */
export function appliquerElement(
  db: Db,
  source: SourceItem,
  el: ElementApplique,
  maintenant: Date = new Date(),
): ResultatElement {
  const aVerifier = el.confiance < SEUIL_CONFIANCE || el.echeance?.ambigu === true;

  if (el.type === 'rendu_effectue') {
    const cible = trouverCible(db, el, SEUIL_RENDU, true, TYPES_RENDABLES, false);
    if (!cible) return 'ignore';
    lier(db, cible.id, source.id, 'rendu', el.citation);
    if (cible.lockedByUser) return 'confirme';
    db.update(items)
      .set({ status: 'termine', completedAt: source.sentAt, updatedAt: maintenant.toISOString() })
      .where(eq(items.id, cible.id))
      .run();
    historiser(db, cible.id, 'status', cible.status, 'termine', source.id);
    return 'rendu';
  }

  // Séances en ligne et changements de séance vont dans le calendrier (changements_seance),
  // jamais dans les tâches.
  if (!(TYPES_TACHE as readonly string[]).includes(el.type)) return 'info';

  const dueAt = el.echeance?.echeance.toISOString() ?? null;
  const niveau = niveauDeSource(source.source);
  const texteConsigne = (el.detailsComment || el.quoi || '').trim();
  const cible = trouverCible(db, el, SEUIL_FUSION, true);
  if (cible) {
    const echeancePassee =
      el.echeance && maintenant.getTime() - el.echeance.echeance.getTime() > 7 * JOUR_MS;
    const nouvelleDate = dueAt && dueAt !== cible.dueAt && !echeancePassee ? dueAt : null;
    // Une date moins fiable que l'actuelle (ou sur une tâche modifiée par Fares) est proposée,
    // jamais appliquée d'office.
    const dateAppliquee =
      nouvelleDate && !cible.lockedByUser && dateAcceptee(niveau, cible.niveauEcheance)
        ? nouvelleDate
        : null;
    const aspects: Aspect[] = [
      ...new Set([...(el.aspects ?? []), ...(nouvelleDate ? (['date'] as Aspect[]) : [])]),
    ];
    const consigne = enregistrerConsigne(db, {
      itemId: cible.id,
      sourceItemId: source.id,
      niveau,
      aspects,
      texte: texteConsigne,
      dateInfo: source.sentAt,
      // Une nouvelle date seule ne remplace que l'aspect « date », pas les autres consignes.
      remplace: el.remplace ? aspects : nouvelleDate ? ['date'] : [],
      echeanceProposee: nouvelleDate && !dateAppliquee ? nouvelleDate : null,
      // Date refusée parce que moins fiable que l'actuelle : à vérifier par Fares.
      aVerifier: Boolean(
        nouvelleDate && !cible.lockedByUser && !dateAcceptee(niveau, cible.niveauEcheance),
      ),
      aVoir: cible.lockedByUser,
      notifier:
        cible.groupe !== 'RT4/2' &&
        consigneANotifier(aspects, Boolean(nouvelleDate)) &&
        new Date(source.sentAt).getTime() > maintenant.getTime() - 2 * JOUR_MS,
    });

    if (cible.lockedByUser) {
      lier(db, cible.id, source.id, 'confirmation', el.citation);
      return 'confirme';
    }
    if (el.projet) rangerDansProjet(db, cible.id, el.projet, cible.subjectId ?? el.subjectId);
    const maj: Partial<typeof items.$inferInsert> = {};
    if (dateAppliquee) {
      historiser(db, cible.id, 'dueAt', cible.dueAt, dateAppliquee, source.id);
      maj.dueAt = dateAppliquee;
      maj.dueAllDay = el.echeance!.jourEntier;
      maj.niveauEcheance = niveau;
    }
    const m = mode(el.modeComment);
    // Le mode de rendu ne change que si l'info est au moins aussi fiable (toi > écrit > Messenger).
    if (m && m !== cible.howMode && (!cible.howMode || dateAcceptee(niveau, cible.niveauEcheance)))
      maj.howMode = m;
    if (consigne) {
      const resume = resumeConsignes(db, cible.id);
      if (resume !== cible.howTo) maj.howTo = resume;
    }
    if (!cible.description && el.quoi) maj.description = el.quoi;
    if ((aVerifier || consigne?.aVerifier) && !cible.needsReview) maj.needsReview = true;
    // Tâche de toute la filière, précisée pour le groupe de Fares.
    if (cible.groupe === 'RT4' && normaliserGroupe(el.groupe) === 'RT4/1') maj.groupe = 'RT4/1';
    if (Object.keys(maj).length) {
      db.update(items)
        .set({ ...maj, updatedAt: maintenant.toISOString() })
        .where(eq(items.id, cible.id))
        .run();
      lier(db, cible.id, source.id, 'mise_a_jour', el.citation);
      return 'maj';
    }
    lier(db, cible.id, source.id, 'confirmation', el.citation);
    return 'confirme';
  }

  if (el.echeance && maintenant.getTime() - el.echeance.echeance.getTime() > 7 * JOUR_MS)
    return 'ignore';
  // Sans échéance, un message de plus de 3 semaines parle presque toujours d'un travail dépassé
  // (ex. anciens TP NestJS, formation des groupes en début de semestre).
  const ageSource = maintenant.getTime() - new Date(source.sentAt).getTime();
  if (!el.echeance && ageSource > SANS_DATE_MAX_JOURS * JOUR_MS) return 'ignore';
  const nouvelle = db
    .insert(items)
    .values({
      type: TYPE_ITEM[el.type] ?? 'tache',
      title: el.titre.trim() || 'Tâche',
      description: el.quoi || null,
      subjectId: el.subjectId,
      dueAt,
      dueAllDay: el.echeance?.jourEntier ?? true,
      importance: el.importance,
      source: 'ia',
      externalId: null,
      accountId: source.accountId,
      sourceUrl: lienDuPassage(source.link, source.passages, el.citation),
      confidence: Math.round(el.confiance * 100),
      needsReview: aVerifier,
      howMode: mode(el.modeComment),
      howTo: el.detailsComment,
      groupe: normaliserGroupe(el.groupe),
      niveauEcheance: niveau,
    })
    .returning({ id: items.id })
    .get();
  lier(db, nouvelle.id, source.id, 'creation', el.citation);
  if (el.projet) rangerDansProjet(db, nouvelle.id, el.projet, el.subjectId);
  enregistrerConsigne(db, {
    itemId: nouvelle.id,
    sourceItemId: source.id,
    niveau,
    aspects: el.aspects?.length ? el.aspects : ['contenu'],
    texte: el.detailsComment || '',
    dateInfo: source.sentAt,
    remplace: [],
  });
  return 'cree';
}

/**
 * Retire les tâches créées par l'IA devenues périmées : sans échéance, non terminées,
 * dont la source la plus récente a plus de 3 semaines — sauf si Fares les a modifiées.
 */
export function retirerTachesPerimees(db: Db, maintenant: Date = new Date()): string[] {
  const limite = new Date(maintenant.getTime() - SANS_DATE_MAX_JOURS * JOUR_MS).toISOString();
  const candidates = db
    .select({ id: items.id, titre: items.title })
    .from(items)
    .where(
      and(
        eq(items.source, 'ia'),
        eq(items.lockedByUser, false),
        ne(items.status, 'termine'),
        sql`${items.dueAt} is null`,
      ),
    )
    .all();
  const retirees: string[] = [];
  for (const c of candidates) {
    const derniere = db
      .select({ sentAt: sql<string>`max(${sourceItems.sentAt})` })
      .from(itemSources)
      .innerJoin(sourceItems, eq(itemSources.sourceItemId, sourceItems.id))
      .where(eq(itemSources.itemId, c.id))
      .get()?.sentAt;
    if (derniere && derniere < limite) {
      db.delete(items).where(eq(items.id, c.id)).run();
      retirees.push(c.titre);
    }
  }
  return retirees;
}

// --- Lecture pour l'interface ----------------------------------------------

export function sourcesDeTache(db: Db, itemId: number) {
  return db
    .select({
      role: itemSources.role,
      citation: itemSources.quote,
      source: {
        id: sourceItems.id,
        source: sourceItems.source,
        direction: sourceItems.direction,
        titre: sourceItems.title,
        expediteur: sourceItems.sender,
        envoyeLe: sourceItems.sentAt,
        lien: sourceItems.link,
      },
      passages: sourceItems.passages,
    })
    .from(itemSources)
    .innerJoin(sourceItems, eq(itemSources.sourceItemId, sourceItems.id))
    .where(eq(itemSources.itemId, itemId))
    .orderBy(desc(sourceItems.sentAt))
    .all()
    .map(({ passages, ...r }) => ({
      ...r,
      source: { ...r.source, lien: lienDuPassage(r.source.lien, passages, r.citation) },
    }));
}

export function listerSourcesRecentes(db: Db, limite = 60) {
  return db
    .select({
      s: sourceItems,
      matiere: { code: subjects.code, color: subjects.color },
    })
    .from(sourceItems)
    .leftJoin(subjects, eq(sourceItems.subjectHintId, subjects.id))
    .orderBy(desc(sourceItems.sentAt))
    .limit(limite)
    .all();
}

export function tachesLieesASources(db: Db, ids: number[]) {
  if (!ids.length) return [];
  return db
    .select({
      sourceItemId: itemSources.sourceItemId,
      itemId: items.id,
      titre: items.title,
      role: itemSources.role,
    })
    .from(itemSources)
    .innerJoin(items, eq(itemSources.itemId, items.id))
    .where(inArray(itemSources.sourceItemId, ids))
    .all();
}

// --- Quota Gemini ------------------------------------------------------------

export function compterUsage(db: Db, day: string, model: string, tokens: number): void {
  db.insert(aiUsage)
    .values({ day, model, requests: 1, tokens })
    .onConflictDoUpdate({
      target: [aiUsage.day, aiUsage.model],
      set: { requests: sql`${aiUsage.requests} + 1`, tokens: sql`${aiUsage.tokens} + ${tokens}` },
    })
    .run();
}

export function usageDuJour(db: Db, day: string): number {
  return (
    db
      .select({ n: sql<number>`coalesce(sum(${aiUsage.requests}), 0)` })
      .from(aiUsage)
      .where(eq(aiUsage.day, day))
      .get()?.n ?? 0
  );
}

/** Un élément source (mail, annonce, conversation…) pour sa page de lecture dans l'app. */
export function trouverSource(db: Db, id: number): SourceItem | undefined {
  return db.select().from(sourceItems).where(eq(sourceItems.id, id)).get();
}

/** Conversations Messenger d'un salon dont on ne connaît pas encore les messages (rattrapage). */
export function conversationsSansPassages(db: Db, salon: string, limite: number) {
  return db
    .select({ id: sourceItems.id, externalId: sourceItems.externalId })
    .from(sourceItems)
    .where(
      and(
        eq(sourceItems.source, 'messenger'),
        sql`${sourceItems.externalId} like ${`${salon}|$%`}`,
        sql`${sourceItems.passages} = '[]'`,
      ),
    )
    .orderBy(desc(sourceItems.sentAt))
    .limit(limite)
    .all();
}

export function enregistrerPassages(db: Db, id: number, passages: { id: string; texte: string }[]) {
  db.update(sourceItems).set({ passages }).where(eq(sourceItems.id, id)).run();
}

/**
 * Lien des tâches venues de Messenger : vers le message exact qui les a créées (citation de
 * l'IA), au lieu du début de la conversation. Rejouable : ne change que ce qui doit l'être.
 */
export function corrigerLiensMessenger(db: Db): number {
  const lignes = db
    .select({
      id: items.id,
      lien: items.sourceUrl,
      citation: itemSources.quote,
      lienSource: sourceItems.link,
      passages: sourceItems.passages,
    })
    .from(items)
    .innerJoin(itemSources, and(eq(itemSources.itemId, items.id), eq(itemSources.role, 'creation')))
    .innerJoin(sourceItems, eq(itemSources.sourceItemId, sourceItems.id))
    .where(and(eq(items.source, 'ia'), eq(sourceItems.source, 'messenger')))
    .all();
  let n = 0;
  for (const l of lignes) {
    const juste = lienDuPassage(l.lienSource, l.passages, l.citation);
    if (juste && juste !== l.lien) {
      db.update(items).set({ sourceUrl: juste }).where(eq(items.id, l.id)).run();
      n++;
    }
  }
  return n;
}
