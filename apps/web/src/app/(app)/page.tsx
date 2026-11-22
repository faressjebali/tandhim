import Link from 'next/link';
import {
  SESSION_TYPE_LABELS,
  type SeanceAffichee,
  formatDayKey,
  formatTunis,
  isDayKey,
  seanceSupprimee,
  seancesDuJour,
  tunisDayKey,
  tunisInstantOn,
  weekLabel,
  weekOf,
} from '@tandhim/core';
import { BandeJours } from '@/components/bande-jours';
import { BarreDuJour } from '@/components/barre-du-jour';
import { BoutonAjouter } from '@/components/bouton-ajouter';
import { CarteNouveauProjet, CarteProjet } from '@/components/carte-projet';
import { DetailsChangement } from '@/components/changement';
import { Entete, PastilleSemaine, TitreSection } from '@/components/entete';
import { Rafraichir } from '@/components/rafraichir';
import { SeanceRevisionLigne } from '@/components/seance-revision';
import { LigneTache } from '@/components/tache';
import { maintenantPour } from '@/lib/apercu';
import { getDb } from '@/lib/db';
import { listerSeancesRevision } from '@tandhim/db';
import {
  type Matieres,
  chargerCalendrier,
  chargerChangements,
  chargerMatieres,
  chargerProjets,
  chargerTachesTriees,
  echeanceProjet,
  feriesProches,
  joursBande,
  periodeProche,
  versVue,
} from '@/lib/donnees';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Aujourd’hui' };

const TACHES_VISIBLES = 6;

export default async function Aujourdhui({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; jour?: string }>;
}) {
  const params = await searchParams;
  const maintenant = maintenantPour(params.a);
  const aujourdhui = tunisDayKey(maintenant);
  const jour = params.jour && isDayKey(params.jour) ? params.jour : aujourdhui;
  const estAujourdhui = jour === aujourdhui;

  const data = chargerCalendrier();
  const matieres = chargerMatieres();
  const seances = seancesDuJour(jour, data, chargerChangements(jour));
  const semaine = weekOf(jour, data.weeks);
  const projets = chargerProjets();
  const taches = chargerTachesTriees(maintenant);
  const periode = periodeProche(jour, data.events);
  const feries = feriesProches(jour, data.events, 7);
  const revisions = listerSeancesRevision(
    getDb().db,
    tunisInstantOn(jour, '00:00'),
    tunisInstantOn(jour, '23:59'),
  );

  return (
    <>
      {estAujourdhui && <Rafraichir />}
      <Entete
        contexte={formatDayKey(jour, 'EEEE d MMMM')}
        titre={estAujourdhui ? 'Aujourd’hui' : formatDayKey(jour, 'EEEE d')}
        aside={
          semaine ? (
            <PastilleSemaine numero={semaine.number} lettre={semaine.letter} />
          ) : (
            <span className="pastille bg-surface py-1 text-[13px]">{weekLabel(jour, data)}</span>
          )
        }
      />
      <BandeJours jours={joursBande(aujourdhui, data)} choisi={jour} aujourdhui={aujourdhui} />

      {(periode || feries.length > 0) && (
        <section aria-label="À venir dans le calendrier" className="mb-7 flex flex-col gap-2">
          {periode && (
            <p className="bloc bg-violet px-4 py-3 text-[15px] text-white">
              <span className="font-bold">{periode.event.title}</span>{' '}
              {periode.dans === 0
                ? `jusqu’au ${formatDayKey(periode.event.endDate, 'd MMMM')}`
                : `dans ${periode.dans} jour${periode.dans > 1 ? 's' : ''}, le ${formatDayKey(periode.event.startDate, 'd MMMM')}`}
            </p>
          )}
          {feries.map((f) => (
            <p key={f.startDate} className="bloc bg-surface px-4 py-3 text-[15px]">
              <span className="font-bold">{f.title}</span>{' '}
              <span className="text-gris">
                {formatDayKey(f.startDate, 'EEEE d MMMM')}
                {f.status === 'a_confirmer' && ', date à confirmer'}
              </span>
            </p>
          ))}
        </section>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div>
          <section aria-labelledby="projets" className="mb-8">
            <TitreSection
              id="projets"
              lien={
                projets.length > 0 && (
                  <Link href="/projets" className="text-[14px] font-semibold underline">
                    Tous
                  </Link>
                )
              }
            >
              Projets en cours
            </TitreSection>
            <div className="defile-x -mx-5 flex scroll-px-5 gap-3 px-5 pb-2 pt-0.5 lg:mx-0 lg:scroll-px-0.5 lg:px-0.5">
              {projets.map((p) => (
                <CarteProjet key={p.id} projet={p} echeance={echeanceProjet(p, aujourdhui)} />
              ))}
              <CarteNouveauProjet />
            </div>
          </section>

          <section aria-labelledby="a-faire" className="mb-8">
            <TitreSection
              id="a-faire"
              lien={
                taches.length > TACHES_VISIBLES && (
                  <Link href="/a-faire" className="text-[14px] font-semibold underline">
                    Tout voir ({taches.length})
                  </Link>
                )
              }
            >
              À faire
            </TitreSection>
            {taches.length === 0 ? (
              <div className="rounded-[18px] border-2 border-dashed border-encre p-4 text-[15px]">
                <p className="font-semibold">Rien à faire pour l’instant.</p>
                <p className="text-gris">
                  Ajoute une tâche avec le bouton +. Les devoirs Classroom arriveront ici tout
                  seuls.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {taches.slice(0, TACHES_VISIBLES).map((t) => (
                  <LigneTache key={t.id} tache={versVue(t, maintenant)} retour="/" />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          <section aria-labelledby="cours" className="mb-8">
            <TitreSection id="cours">
              {estAujourdhui ? 'Cours du jour' : `Cours du ${formatDayKey(jour, 'EEEE d')}`}
            </TitreSection>
            {seances.length === 0 ? (
              <p className="bloc bg-surface px-4 py-3 text-[15px]">Pas de cours ce jour-là.</p>
            ) : (
              <div className="bloc bg-surface p-4">
                <BarreDuJour
                  seances={seances}
                  matieres={matieres}
                  maintenant={estAujourdhui ? maintenant : undefined}
                  grande
                />
                <ListeSeances
                  seances={seances}
                  matieres={matieres}
                  maintenant={estAujourdhui ? maintenant : undefined}
                />
              </div>
            )}
          </section>
          {revisions.length > 0 && (
            <section aria-labelledby="revisions" className="mb-8">
              <TitreSection
                id="revisions"
                lien={
                  <Link href="/revisions" className="text-[14px] font-semibold underline">
                    Planning
                  </Link>
                }
              >
                Révisions du jour
              </TitreSection>
              <ul className="bloc divide-y-2 divide-dashed divide-ligne bg-surface px-4 py-1">
                {revisions.map((r) => (
                  <SeanceRevisionLigne
                    key={r.id}
                    id={r.id}
                    faite={r.faite}
                    quand={`${formatTunis(r.debut, 'HH:mm')}–${formatTunis(r.fin, 'HH:mm')}`}
                    titre={r.epreuve.titre}
                    couleur={r.matiere?.couleur}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <BoutonAjouter retour={estAujourdhui ? '/' : `/?jour=${jour}`} />
    </>
  );
}

function ListeSeances({
  seances,
  matieres,
  maintenant,
}: {
  seances: SeanceAffichee[];
  matieres: Matieres;
  maintenant?: Date;
}) {
  return (
    <ol className="mt-4 flex flex-col">
      {seances.map((s) => {
        const m = matieres.get(s.subjectCode);
        const enCours = maintenant && s.start <= maintenant && maintenant < s.end;
        const finie = maintenant && s.end <= maintenant;
        const supprimee = seanceSupprimee(s);
        return (
          <li
            key={`${s.start.toISOString()}-${s.subjectCode}-${s.ajoutee ? 'ajoutee' : 'edt'}`}
            className={`flex gap-3 border-t-2 border-dashed border-ligne py-2.5 ${finie ? 'opacity-50' : ''}`}
          >
            <span className="chiffres w-12 shrink-0 pt-0.5 text-[14px] font-semibold">
              {formatTunis(s.start, 'HH:mm')}
            </span>
            <span
              aria-hidden
              className="mt-1 h-4 w-4 shrink-0 rounded-md border-2 border-encre"
              style={{ background: m?.color }}
            />
            <div className="min-w-0 flex-1">
              <span
                className={`block text-[15px] font-semibold leading-snug ${supprimee ? 'text-gris line-through' : ''}`}
              >
                {m?.name ?? s.subjectCode}
              </span>
              <span className={`block text-[13px] text-gris ${supprimee ? 'line-through' : ''}`}>
                {[SESSION_TYPE_LABELS[s.type], s.room && `salle ${s.room}`, s.teacher]
                  .filter(Boolean)
                  .join(', ')}
              </span>
              <DetailsChangement seance={s} />
            </div>
            {enCours && !supprimee && (
              <span className="pastille h-fit bg-corail text-white">Maintenant</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
