import { notFound } from 'next/navigation';
import { formatTunis, tunisDayKey } from '@tandhim/core';
import { TitreSection } from '@/components/entete';
import { fichiersDeTache, listerConsignes, sourcesDeTache, trouverTache } from '@tandhim/db';
import { effacerTache } from '@/app/(app)/actions';
import { ConsignesTache } from '@/components/consignes';
import { Entete } from '@/components/entete';
import { FormulaireTache } from '@/components/formulaires';
import { LienRetour } from '@/components/retour';
import { LigneTache } from '@/components/tache';
import { getDb } from '@/lib/db';
import { optionsFormulaires, retourSur, versVue } from '@/lib/donnees';
import { LienSource } from '@/components/lien-source';
import { TexteAvecLiens } from '@/components/texte-avec-liens';
import { FileText, Paperclip } from 'lucide-react';
import { maintenant as maintenantApp } from '@/lib/apercu';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tâche' };

const MODES: Record<string, string> = {
  mail: 'par mail',
  classroom: 'sur Classroom',
  presentiel: 'en présentiel',
  validation: 'en validation',
  en_ligne: 'en ligne',
  autre: 'autre',
};
const ROLES: Record<string, string> = {
  creation: 'A créé la tâche',
  mise_a_jour: 'Mise à jour',
  confirmation: 'Confirme',
  rendu: 'Rendu détecté',
};

export default async function PageTache({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retour?: string }>;
}) {
  const tache = trouverTache(getDb().db, Number((await params).id));
  if (!tache) notFound();
  const retour = retourSur((await searchParams).retour, '/a-faire');
  const { matieres, projets } = optionsFormulaires();
  const ici = `/taches/${tache.id}?retour=${encodeURIComponent(retour)}`;
  const sources = sourcesDeTache(getDb().db, tache.id);
  const consignes = listerConsignes(getDb().db, tache.id);
  const fichiers = fichiersDeTache(getDb().db, tache.id);

  return (
    <div className="max-w-xl">
      <LienRetour href={retour} />
      <Entete titre="Modifier la tâche" />
      {tache.groupe === 'RT4/2' && (
        <p className="bloc mb-4 bg-papier px-4 py-3 text-[15px]">
          Cette tâche concerne le groupe <span className="font-bold">RT4/2</span> : elle est gardée
          mais masquée de tes listes, rappels et révisions.
        </p>
      )}
      {tache.lienSource && (
        <p className="mb-6">
          {(() => {
            const s = sources.find((x) => x.role === 'creation')?.source ?? sources.at(-1)?.source;
            return (
              <LienSource
                type={s?.source ?? (tache.source === 'classroom' ? 'classroom' : null)}
                sourceId={s?.id}
                href={tache.lienSource}
                retour={ici}
                className="bloc bloc-presse inline-block bg-surface px-4 py-2.5 text-[15px] font-semibold"
              />
            );
          })()}
        </p>
      )}
      <ul className="mb-6">
        <LigneTache tache={versVue(tache, maintenantApp())} retour={ici} />
      </ul>
      {(tache.description || tache.modeRendu || tache.commentFaire || consignes.length > 0) && (
        <section aria-labelledby="consigne" className="bloc mb-6 bg-surface p-4">
          <TitreSection id="consigne">Quoi faire</TitreSection>
          {tache.description && (
            <p className="mb-3 text-[16px]">
              <TexteAvecLiens texte={tache.description} />
            </p>
          )}
          {tache.modeRendu && (
            <p className="text-[15px]">
              <span className="font-semibold">Rendu : </span>
              {MODES[tache.modeRendu]}
            </p>
          )}
          {consignes.length > 0 ? (
            <ConsignesTache itemId={tache.id} consignes={consignes} />
          ) : (
            tache.commentFaire && (
              <p className="text-[15px]">
                <span className="font-semibold">Comment : </span>
                <TexteAvecLiens texte={tache.commentFaire} />
              </p>
            )
          )}
          {tache.source === 'ia' && tache.confiance !== null && (
            <p className="mt-2 text-[13px] text-gris">
              Repéré automatiquement (certitude {tache.confiance} %). Corrige-la ci-dessous si
              besoin : ta version ne sera jamais écrasée.
            </p>
          )}
        </section>
      )}
      <section aria-labelledby="fichiers" className="mb-6">
        <TitreSection id="fichiers">Fichiers</TitreSection>
        {fichiers.length ? (
          <ul className="flex flex-col gap-2">
            {fichiers.map((f) => (
              <li key={f.url}>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="bloc bloc-presse flex min-h-12 items-center gap-3 bg-surface px-4 py-2.5"
                >
                  {f.interne ? (
                    <Paperclip size={18} aria-hidden className="shrink-0" />
                  ) : (
                    <FileText size={18} aria-hidden className="shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">{f.nom}</span>
                    <span className="block text-[12px] text-gris">{f.origine}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-gris">
            Aucun fichier trouvé dans les messages liés à cette tâche.
          </p>
        )}
      </section>
      {sources.length > 0 && (
        <section aria-labelledby="sources" className="mb-6">
          <TitreSection id="sources">Sources</TitreSection>
          <ul className="flex flex-col gap-2">
            {sources.map(({ source: s, role, citation }) => (
              <li key={s.id} className="rounded-[18px] border-2 border-dashed border-ligne p-3">
                <p className="text-[13px] text-gris">
                  {ROLES[role]},{' '}
                  {s.source === 'gmail'
                    ? s.direction === 'envoye'
                      ? 'mail envoyé'
                      : 'mail'
                    : s.source === 'messenger'
                      ? 'Messenger'
                      : s.source === 'drive'
                        ? 'Drive'
                        : 'Classroom'}
                  , {formatTunis(new Date(s.envoyeLe), "d MMM 'à' HH:mm")}
                </p>
                <p className="text-[15px] font-semibold">{s.titre ?? 'Sans titre'}</p>
                {s.expediteur && <p className="break-all text-[13px] text-gris">{s.expediteur}</p>}
                {citation && (
                  <p className="mt-1 text-[14px] italic">
                    « <TexteAvecLiens texte={citation} /> »
                  </p>
                )}
                {s.lien && (
                  <p className="mt-1 text-[14px]">
                    <LienSource type={s.source} href={s.lien} sourceId={s.id} retour={ici} />
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <FormulaireTache
        matieres={matieres}
        projets={projets}
        retour={retour}
        valeurs={{
          id: tache.id,
          titre: tache.titre,
          description: tache.description,
          echeanceJour: tache.echeance ? tunisDayKey(tache.echeance) : undefined,
          echeanceHeure:
            tache.echeance && !tache.echeanceJourEntier
              ? formatTunis(tache.echeance, 'HH:mm')
              : undefined,
          importance: tache.importance,
          matiereId: tache.matiere?.id,
          projetId: tache.projet?.id,
          type: tache.type === 'ds' || tache.type === 'examen' ? tache.type : 'tache',
        }}
      />
      <form action={effacerTache} className="mt-8">
        <input type="hidden" name="id" value={tache.id} />
        <input type="hidden" name="retour" value={retour} />
        <button type="submit" className="text-[16px] font-semibold text-corail underline">
          Supprimer la tâche
        </button>
      </form>
    </div>
  );
}
