import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DbHandle, applySeed, creerTache, listerTaches, modifierTache, openDb } from './index';
import { runMigrations } from './migrate';
import {
  type ElementApplique,
  type SourceItem,
  ajouterSource,
  appliquerElement,
  retirerTachesPerimees,
  compterUsage,
  sourcesATraiter,
  sourcesDeTache,
  usageDuJour,
} from './moteur';
import { consignes, itemHistory, sourceItems, subjects } from './schema';
import { consignesANotifier, tachesAvecNouvelleInfo } from './consignes';

let dir: string;
let h: DbHandle;
let tns: number;
const maintenant = new Date('2026-11-23T09:00:00Z');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tandhim-moteur-'));
  h = openDb(dir);
  runMigrations(h.db);
  applySeed(h.db);
  tns = h.db.select().from(subjects).where(eq(subjects.code, 'TNS')).get()!.id;
});
afterEach(() => {
  h.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

let n = 0;
function source(p: Partial<SourceItem> = {}): SourceItem {
  ajouterSource(h.db, {
    source: 'gmail',
    externalId: `m${++n}`,
    sentAt: '2026-11-23T08:00:00Z',
    title: 'TP3',
    body: '…',
    link: `https://mail.google.com/#m${n}`,
    ...p,
  });
  return h.db
    .select()
    .from(sourceItems)
    .where(eq(sourceItems.externalId, p.externalId ?? `m${n}`))
    .get()!;
}
const el = (p: Partial<ElementApplique> = {}): ElementApplique => ({
  type: 'compte_rendu',
  titre: 'Compte rendu TP3',
  quoi: 'Rédiger le compte rendu du TP3 de filtrage.',
  modeComment: 'mail',
  detailsComment: 'à envoyer à ferchichi@exemple.tn en PDF',
  importance: 'normale',
  confiance: 0.9,
  citation: 'CR du TP3 à envoyer par mail avant jeudi',
  concerne: null,
  subjectId: tns,
  echeance: { echeance: new Date('2026-11-26T22:59:00Z'), jourEntier: true },
  ...p,
});

describe('file des éléments sources', () => {
  it('pas de doublon, traités du plus ancien au plus récent', () => {
    expect(
      ajouterSource(h.db, { source: 'gmail', externalId: 'x', sentAt: '2026-11-22T10:00:00Z' }),
    ).toBe(true);
    expect(
      ajouterSource(h.db, { source: 'gmail', externalId: 'x', sentAt: '2026-11-22T10:00:00Z' }),
    ).toBe(false);
    ajouterSource(h.db, { source: 'gmail', externalId: 'y', sentAt: '2026-11-20T10:00:00Z' });
    expect(sourcesATraiter(h.db, 10).map((s) => s.externalId)).toEqual(['y', 'x']);
  });
});

describe('application des éléments extraits', () => {
  it('crée une tâche avec quoi / comment / échéance, liée à sa source', () => {
    const s = source();
    expect(appliquerElement(h.db, s, el(), maintenant)).toBe('cree');
    const [t] = listerTaches(h.db);
    expect(t).toMatchObject({
      titre: 'Compte rendu TP3',
      source: 'ia',
      aVerifier: false,
      description: 'Rédiger le compte rendu du TP3 de filtrage.',
      modeRendu: 'mail',
      commentFaire: 'à envoyer à ferchichi@exemple.tn en PDF',
      confiance: 90,
    });
    expect(t?.echeance?.toISOString()).toBe('2026-11-26T22:59:00.000Z');
    expect(sourcesDeTache(h.db, t!.id)[0]).toMatchObject({ role: 'creation' });
  });

  it('confiance basse → badge « à vérifier »', () => {
    appliquerElement(h.db, source(), el({ confiance: 0.4 }), maintenant);
    expect(listerTaches(h.db)[0]?.aVerifier).toBe(true);
  });

  it('même travail annoncé par une 2e source : fusion, nouvelle date, ancienne historisée', () => {
    appliquerElement(h.db, source(), el(), maintenant);
    const s2 = source({ sentAt: '2026-11-24T08:00:00Z' });
    const r = appliquerElement(
      h.db,
      s2,
      el({
        titre: 'CR du TP 3',
        echeance: { echeance: new Date('2026-11-30T22:59:00Z'), jourEntier: true },
      }),
      maintenant,
    );
    expect(r).toBe('maj');
    const taches = listerTaches(h.db);
    expect(taches).toHaveLength(1);
    expect(taches[0]?.echeance?.toISOString()).toBe('2026-11-30T22:59:00.000Z');
    expect(h.db.select().from(itemHistory).all()[0]).toMatchObject({
      field: 'dueAt',
      oldValue: '2026-11-26T22:59:00.000Z',
    });
    expect(sourcesDeTache(h.db, taches[0]!.id)).toHaveLength(2);
  });

  it('une tâche modifiée par Fares n’est pas changée, la source est seulement liée', () => {
    appliquerElement(h.db, source(), el(), maintenant);
    const t = listerTaches(h.db)[0]!;
    modifierTache(h.db, t.id, {
      titre: 'Compte rendu TP3',
      echeanceJour: '2026-11-28',
      matiereId: tns,
    });
    const r = appliquerElement(
      h.db,
      source(),
      el({ echeance: { echeance: new Date('2026-12-10T22:59:00Z'), jourEntier: true } }),
      maintenant,
    );
    expect(r).toBe('confirme');
    expect(listerTaches(h.db)[0]?.echeance?.toISOString()).toBe('2026-11-28T22:59:00.000Z');
  });

  it('un mail envoyé qui transmet le travail le marque terminé', () => {
    appliquerElement(h.db, source(), el(), maintenant);
    const envoi = source({ direction: 'envoye', sentAt: '2026-11-25T20:00:00Z' });
    expect(
      appliquerElement(
        h.db,
        envoi,
        el({ type: 'rendu_effectue', titre: 'Envoi CR TP3' }),
        maintenant,
      ),
    ).toBe('rendu');
    expect(listerTaches(h.db)[0]).toMatchObject({ statut: 'termine' });
  });

  it('la tâche désignée par l’IA (« concerne ») est utilisée même si le titre diffère', () => {
    const id = creerTache(h.db, { titre: 'Rapport filtrage', matiereId: tns });
    const r = appliquerElement(
      h.db,
      source({ direction: 'envoye' }),
      el({ type: 'rendu_effectue', titre: 'Envoi', concerne: id }),
      maintenant,
    );
    // Tâche saisie à la main = verrouillée : liée, mais pas modifiée.
    expect(r).toBe('confirme');
  });

  it('infos sans tâche, échéances anciennes ignorées', () => {
    expect(appliquerElement(h.db, source(), el({ type: 'info_prof' }), maintenant)).toBe('info');
    expect(
      appliquerElement(
        h.db,
        source(),
        el({
          titre: 'Vieux TP1',
          echeance: { echeance: new Date('2026-10-01T22:59:00Z'), jourEntier: true },
        }),
        maintenant,
      ),
    ).toBe('ignore');
    expect(listerTaches(h.db)).toHaveLength(0);
  });
});

describe('garde-fous', () => {
  it('séance en ligne sans date : information, pas de tâche', () => {
    expect(
      appliquerElement(
        h.db,
        source(),
        el({ type: 'seance_en_ligne', titre: 'Lien Meet TNS', echeance: null }),
        maintenant,
      ),
    ).toBe('info');
    expect(listerTaches(h.db)).toHaveLength(0);
  });

  it('séance en ligne datée : pas de tâche non plus (elle va dans le calendrier)', () => {
    expect(
      appliquerElement(
        h.db,
        source(),
        el({
          type: 'seance_en_ligne',
          titre: 'Séance en ligne TNS',
          echeance: { echeance: new Date('2026-11-24T09:00:00Z'), jourEntier: false },
        }),
        maintenant,
      ),
    ).toBe('info');
    expect(listerTaches(h.db)).toHaveLength(0);
  });
});

describe('travaux sans date', () => {
  it('ignorés s’ils viennent d’un message de plus de 3 semaines, créés s’il est récent', () => {
    const vieux = source({ sentAt: '2026-10-20T08:00:00Z' });
    expect(
      appliquerElement(h.db, vieux, el({ titre: 'TP2 NestJS', echeance: null }), maintenant),
    ).toBe('ignore');
    const recent = source({ sentAt: '2026-11-20T08:00:00Z' });
    expect(
      appliquerElement(
        h.db,
        recent,
        el({ titre: 'Installation OMNET++', echeance: null }),
        maintenant,
      ),
    ).toBe('cree');
  });
});

describe('nettoyage des tâches périmées', () => {
  it('retire une tâche IA sans date dont la dernière source a > 3 semaines, garde les autres', () => {
    const recent = source({ sentAt: '2026-11-20T08:00:00Z' });
    appliquerElement(h.db, recent, el({ titre: 'Ancien CR', echeance: null }), maintenant);
    // On vieillit la source : comme si la tâche avait été créée il y a longtemps.
    h.db
      .update(sourceItems)
      .set({ sentAt: '2026-10-07T08:00:00Z' })
      .where(eq(sourceItems.id, recent.id))
      .run();
    appliquerElement(
      h.db,
      source({ sentAt: '2026-11-21T08:00:00Z' }),
      el({ titre: 'Installation OMNET++', echeance: null }),
      maintenant,
    );
    appliquerElement(h.db, source(), el({ titre: 'Projet daté' }), maintenant);
    expect(retirerTachesPerimees(h.db, maintenant)).toEqual(['Ancien CR']);
    expect(
      listerTaches(h.db)
        .map((t) => t.titre)
        .sort(),
    ).toEqual(['Installation OMNET++', 'Projet daté']);
  });
});

describe('échéances anciennes', () => {
  it('une source qui apporte une date passée depuis > 7 j ne l’applique pas à une tâche existante', () => {
    appliquerElement(h.db, source(), el({ echeance: null }), maintenant);
    appliquerElement(
      h.db,
      source(),
      el({ echeance: { echeance: new Date('2025-11-30T17:00:00Z'), jourEntier: false } }),
      maintenant,
    );
    expect(listerTaches(h.db)[0]?.echeance).toBeNull();
  });
});

describe('quota Gemini', () => {
  it('compte les requêtes par jour, tous modèles confondus', () => {
    compterUsage(h.db, '2026-11-23', 'a', 100);
    compterUsage(h.db, '2026-11-23', 'a', 50);
    compterUsage(h.db, '2026-11-23', 'b', 10);
    expect(usageDuJour(h.db, '2026-11-23')).toBe(3);
    expect(usageDuJour(h.db, '2026-11-24')).toBe(0);
  });
});

describe('jour relatif ambigu', () => {
  it('« vendredi jey » dit un samedi : tâche créée au plus proche, marquée à vérifier', () => {
    appliquerElement(
      h.db,
      source(),
      el({
        titre: 'Rendu ambigu',
        confiance: 0.95,
        echeance: { echeance: new Date('2026-11-27T22:59:00Z'), jourEntier: true, ambigu: true },
      }),
      maintenant,
    );
    expect(listerTaches(h.db).find((t) => t.titre === 'Rendu ambigu')?.aVerifier).toBe(true);
  });
});

describe('groupes RT4 / RT4/1 / RT4/2', () => {
  const j = (iso: string) => ({ echeance: new Date(iso), jourEntier: false });

  it('un message, deux groupes : une tâche visible (RT4/1), une masquée (RT4/2)', () => {
    appliquerElement(
      h.db,
      source(),
      el({ titre: 'Validation TP3', groupe: 'RT4/1', echeance: j('2026-12-10T13:00:00Z') }),
      maintenant,
    );
    appliquerElement(
      h.db,
      source(),
      el({ titre: 'Validation TP3', groupe: 'RT4/2', echeance: j('2026-12-11T13:00:00Z') }),
      maintenant,
    );
    expect(listerTaches(h.db).map((t) => [t.titre, t.groupe])).toEqual([
      ['Validation TP3', 'RT4/1'],
    ]);
    expect(listerTaches(h.db, { tousGroupes: true })).toHaveLength(2);
  });

  it('une date RT4/2 ne déplace jamais la tâche de toute la filière', () => {
    appliquerElement(
      h.db,
      source(),
      el({ titre: 'Validation TP3', echeance: j('2026-12-10T13:00:00Z') }),
      maintenant,
    );
    appliquerElement(
      h.db,
      source(),
      el({ titre: 'Validation TP3', groupe: 'RT4/2', echeance: j('2026-12-11T13:00:00Z') }),
      maintenant,
    );
    const visibles = listerTaches(h.db);
    expect(visibles).toHaveLength(1);
    expect(visibles[0]?.echeance?.toISOString()).toBe('2026-12-10T13:00:00.000Z');
  });

  it('une tâche RT4 précisée pour RT4/1 devient RT4/1', () => {
    appliquerElement(
      h.db,
      source(),
      el({ titre: 'Validation TP3', echeance: j('2026-12-10T13:00:00Z') }),
      maintenant,
    );
    appliquerElement(
      h.db,
      source(),
      el({ titre: 'Validation TP3', groupe: 'RT4/1', echeance: j('2026-12-09T13:00:00Z') }),
      maintenant,
    );
    expect(listerTaches(h.db).map((t) => [t.groupe, t.echeance?.toISOString()])).toEqual([
      ['RT4/1', '2026-12-09T13:00:00.000Z'],
    ]);
  });
});

describe('numéro de tâche désigné par l’IA', () => {
  it('refusé si les titres n’ont presque rien en commun (hors rendu)', () => {
    const id = creerTache(h.db, {
      titre: 'Remise totale définitive du projet de TP',
      echeanceJour: '2026-12-04',
    });
    appliquerElement(
      h.db,
      source(),
      el({
        titre: 'Remise rapport conception',
        concerne: id,
        echeance: { echeance: new Date('2026-11-21T22:59:00Z'), jourEntier: true },
      }),
      maintenant,
    );
    const t = listerTaches(h.db).find((x) => x.id === id);
    expect(t?.echeance?.toISOString()).toBe('2026-12-04T22:59:00.000Z');
  });
});

describe('consignes cumulées et niveaux de confiance', () => {
  const j = (iso: string) => ({ echeance: new Date(iso), jourEntier: false });
  const consignesDe = (id: number) =>
    h.db.select().from(consignes).where(eq(consignes.itemId, id)).all();

  it('une info qui complète s’ajoute ; le « comment » garde les deux', () => {
    appliquerElement(
      h.db,
      source(),
      el({
        titre: 'Rapport RHD',
        detailsComment: 'Rapport PDF par mail',
        echeance: j('2026-12-04T10:00:00Z'),
      }),
      maintenant,
    );
    appliquerElement(
      h.db,
      source({ sentAt: '2026-11-24T08:00:00Z' }),
      el({
        titre: 'Rapport RHD',
        detailsComment: 'Ajouter une démo vidéo',
        remplace: false,
        aspects: ['contenu'],
      }),
      maintenant,
    );
    const [t] = listerTaches(h.db);
    expect(t?.commentFaire).toContain('Rapport PDF par mail');
    expect(t?.commentFaire).toContain('Ajouter une démo vidéo');
  });

  it('une date Messenger ne remplace pas la date écrite du prof : proposée, à vérifier', () => {
    appliquerElement(
      h.db,
      source(),
      el({ titre: 'Soutenance RHD', echeance: j('2026-12-04T10:00:00Z') }),
      maintenant,
    );
    appliquerElement(
      h.db,
      source({ source: 'messenger', externalId: '!s|$1', sentAt: '2026-11-23T09:00:00Z' }),
      el({
        titre: 'Soutenance RHD',
        detailsComment: 'reportée au 11 ?',
        remplace: true,
        echeance: j('2026-12-11T10:00:00Z'),
      }),
      maintenant,
    );
    const [t] = listerTaches(h.db);
    expect(t?.echeance?.toISOString()).toBe('2026-12-04T10:00:00.000Z');
    const c = consignesDe(t!.id).find((x) => x.niveau === 'messenger');
    expect(c).toMatchObject({ aVerifier: true, echeanceProposee: '2026-12-11T10:00:00.000Z' });
  });

  it('un nouvel écrit du prof remplace la date et barre l’ancienne consigne de date', () => {
    appliquerElement(
      h.db,
      source(),
      el({ titre: 'Soutenance RHD', echeance: j('2026-12-04T10:00:00Z') }),
      maintenant,
    );
    appliquerElement(
      h.db,
      source({ sentAt: '2026-11-23T09:00:00Z' }),
      el({
        titre: 'Soutenance RHD',
        detailsComment: 'Soutenance décalée au 11, salle 239',
        remplace: true,
        aspects: ['date', 'lieu'],
        echeance: j('2026-12-11T10:00:00Z'),
      }),
      maintenant,
    );
    const [t] = listerTaches(h.db);
    expect(t?.echeance?.toISOString()).toBe('2026-12-11T10:00:00.000Z');
    const c = consignesDe(t!.id).at(-1)!;
    expect(c).toMatchObject({ aVerifier: false, notifier: true });
  });

  it('tâche modifiée par Fares : jamais changée, mais « nouvelle info » et notification si le lieu change', () => {
    const id = creerTache(h.db, {
      titre: 'Soutenance RHD',
      echeanceJour: '2026-12-04',
      echeanceHeure: '10:00',
      matiereId: tns,
    });
    appliquerElement(
      h.db,
      source({ sentAt: '2026-11-23T09:00:00Z' }),
      el({
        titre: 'Soutenance RHD',
        detailsComment: 'Soutenance en salle 239',
        remplace: true,
        aspects: ['lieu'],
      }),
      maintenant,
    );
    expect(listerTaches(h.db)[0]?.echeance?.toISOString()).toBe('2026-12-04T09:00:00.000Z');
    expect(tachesAvecNouvelleInfo(h.db).has(id)).toBe(true);
    expect(consignesANotifier(h.db).map((c) => c.itemId)).toEqual([id]);
  });
});
