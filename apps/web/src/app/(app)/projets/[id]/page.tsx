import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDayKey, trierTaches, tunisDayKey } from '@tandhim/core';
import { listerProjets, listerTaches, trouverProjet } from '@tandhim/db';
import {
  fusionnerProjetAction,
  retirerProjetAction,
  terminerProjet,
  validerProjetAction,
} from '@/app/(app)/actions';
import { BoutonAjouter } from '@/components/bouton-ajouter';
import { TitreSection } from '@/components/entete';
import { Kanban } from '@/components/kanban';
import { LienRetour } from '@/components/retour';
import { LigneTache } from '@/components/tache';
import { getDb } from '@/lib/db';
import { echeanceProjet, versVue } from '@/lib/donnees';
import { TexteAvecLiens } from '@/components/texte-avec-liens';
import { maintenant as maintenantApp } from '@/lib/apercu';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projet' };

export default async function PageProjet({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vue?: string }>;
}) {
  const { db } = getDb();
  const p = trouverProjet(db, Number((await params).id));
  const tableau = (await searchParams).vue === 'tableau';
  if (!p) notFound();
  const maintenant = maintenantApp();
  const toutes = listerTaches(db, { projetId: p.id });
  const ouvertes = trierTaches(toutes, maintenant);
  const faites = toutes.filter((t) => t.statut === 'termine');
  const ici = `/projets/${p.id}`;
  const echeance = echeanceProjet(p, tunisDayKey(maintenant));
  const autres = listerProjets(db, { enCours: true }).filter((o) => o.id !== p.id);

  return (
    <div className="max-w-2xl">
      <LienRetour href="/projets">Projets</LienRetour>
      <header className="bloc mb-6 p-5 text-sur-couleur" style={{ background: p.couleur }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="pastille bg-white/70">
            {p.type === 'cours' ? (p.matiere?.nom ?? 'Cours') : 'Personnel'}
          </span>
          {p.statut === 'termine' && <span className="pastille bg-white/70">Terminé</span>}
        </div>
        <h1 className="titre text-[28px] leading-tight">{p.titre}</h1>
        {p.description && (
          <p className="mt-2 text-[15px]">
            <TexteAvecLiens texte={p.description} />
          </p>
        )}
        {p.echeance && (
          <p className="mt-2 text-[15px] font-semibold">
            Pour le {formatDayKey(p.echeance, 'EEEE d MMMM')}
            {echeance && p.statut === 'en_cours' && !/\d/.test(echeance.charAt(0))
              ? ` (${echeance.toLowerCase()})`
              : ''}
          </p>
        )}
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[14px] font-semibold">
            <span>
              {p.tachesFaites}/{p.tachesTotal} tâches faites
            </span>
            <span className="chiffres">{p.avancement} %</span>
          </div>
          <div className="h-4 overflow-hidden rounded-full border-2 border-[#1e1b2e] bg-white/80">
            <div className="h-full bg-[#1e1b2e]" style={{ width: `${p.avancement}%` }} />
          </div>
        </div>
      </header>

      {p.source === 'ia' && (
        <section
          aria-label="Projet proposé automatiquement"
          className="bloc mb-6 flex flex-col gap-3 bg-surface p-4"
        >
          <p className="text-[15px]">
            {p.aVerifier
              ? 'Projet proposé automatiquement à partir des messages du prof : vérifie-le.'
              : 'Projet proposé automatiquement, validé par toi.'}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {p.aVerifier && (
              <form action={validerProjetAction}>
                <input type="hidden" name="id" value={p.id} />
                <button
                  type="submit"
                  className="bloc bloc-presse bg-vert px-4 py-2.5 text-[15px] font-bold text-white"
                >
                  Valider
                </button>
              </form>
            )}
            {autres.length > 0 && (
              <form action={fusionnerProjetAction} className="flex gap-2">
                <input type="hidden" name="id" value={p.id} />
                <select
                  name="cible"
                  aria-label="Projet dans lequel fusionner"
                  className="h-11 rounded-xl border-2 border-encre bg-papier px-2 text-[15px]"
                >
                  {autres.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.titre}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="bloc bloc-presse bg-surface px-4 py-2.5 text-[15px] font-semibold"
                >
                  Fusionner
                </button>
              </form>
            )}
            <form action={retirerProjetAction}>
              <input type="hidden" name="id" value={p.id} />
              <button
                type="submit"
                className="bloc bloc-presse bg-surface px-4 py-2.5 text-[15px] font-semibold text-corail"
              >
                Supprimer (garder les tâches)
              </button>
            </form>
          </div>
        </section>
      )}

      <div className="mb-8 flex flex-wrap gap-3">
        <Link
          href={`/taches/nouvelle?projet=${p.id}&retour=${encodeURIComponent(ici)}`}
          className="bloc bloc-presse bg-jaune px-4 py-2.5 text-[15px] font-bold text-sur-couleur"
        >
          Ajouter une tâche
        </Link>
        <Link
          href={`/projets/${p.id}/modifier`}
          className="bloc bloc-presse bg-surface px-4 py-2.5 text-[15px] font-semibold"
        >
          Modifier
        </Link>
        <form action={terminerProjet}>
          <input type="hidden" name="id" value={p.id} />
          {p.statut === 'termine' && <input type="hidden" name="rouvrir" value="1" />}
          <button
            type="submit"
            className="bloc bloc-presse bg-surface px-4 py-2.5 text-[15px] font-semibold"
          >
            {p.statut === 'termine' ? 'Rouvrir le projet' : 'Marquer comme terminé'}
          </button>
        </form>
      </div>

      <section aria-labelledby="taches-projet" className="mb-8">
        <TitreSection
          id="taches-projet"
          lien={
            toutes.length > 0 && (
              <span className="flex overflow-hidden rounded-xl border-2 border-encre text-[14px] font-semibold">
                <Link
                  href={ici}
                  aria-current={!tableau ? 'page' : undefined}
                  className={`px-3 py-1.5 ${!tableau ? 'bg-encre text-papier' : 'bg-surface'}`}
                >
                  Liste
                </Link>
                <Link
                  href={`${ici}?vue=tableau`}
                  aria-current={tableau ? 'page' : undefined}
                  className={`border-l-2 border-encre px-3 py-1.5 ${tableau ? 'bg-encre text-papier' : 'bg-surface'}`}
                >
                  Tableau
                </Link>
              </span>
            )
          }
        >
          Tâches
        </TitreSection>
        {toutes.length === 0 ? (
          <p className="rounded-[18px] border-2 border-dashed border-encre p-4 text-[15px]">
            Découpe le projet en tâches : l’avancement se calcule tout seul.
          </p>
        ) : tableau ? (
          <Kanban
            cartes={[...ouvertes, ...faites].map((t) => ({
              ...versVue(t, maintenant),
              statut: t.statut,
            }))}
            retour={`${ici}?vue=tableau`}
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {[...ouvertes, ...faites].map((t) => (
              <LigneTache key={t.id} tache={versVue(t, maintenant)} retour={ici} masquerProjet />
            ))}
          </ul>
        )}
      </section>
      <BoutonAjouter retour={ici} />
    </div>
  );
}
