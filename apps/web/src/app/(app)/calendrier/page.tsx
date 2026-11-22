import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDaysToKey,
  dayOfWeek,
  eventsOn,
  formatDayKey,
  formatTunis,
  isDayKey,
  seancesDuJour,
  tunisDayKey,
  weekOf,
} from '@tandhim/core';
import { BarreDuJour } from '@/components/barre-du-jour';
import { DetailsChangement } from '@/components/changement';
import { Entete } from '@/components/entete';
import { chargerCalendrier, chargerChangements, chargerMatieres } from '@/lib/donnees';
import { maintenant as maintenantApp } from '@/lib/apercu';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Calendrier' };

const lundiDe = (jour: string) => addDaysToKey(jour, 1 - dayOfWeek(jour));

/** « 16–22 novembre », ou « 30 nov.–6 déc. » quand la semaine change de mois. */
function titreSemaine(lundi: string) {
  const dimanche = addDaysToKey(lundi, 6);
  return lundi.slice(0, 7) === dimanche.slice(0, 7)
    ? `${formatDayKey(lundi, 'd')}–${formatDayKey(dimanche, 'd MMMM')}`
    : `${formatDayKey(lundi, 'd MMM')}–${formatDayKey(dimanche, 'd MMM')}`;
}

export default async function Calendrier({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string }>;
}) {
  const { semaine: param } = await searchParams;
  const maintenant = maintenantApp();
  const aujourdhui = tunisDayKey(maintenant);
  const lundi = lundiDe(param && isDayKey(param) ? param : aujourdhui);
  const data = chargerCalendrier();
  const matieres = chargerMatieres();
  const semaine = weekOf(lundi, data.weeks);
  // Lundi → dimanche : il arrive d'avoir cours (ou un rattrapage) le dimanche.
  const jours = Array.from({ length: 7 }, (_, i) => addDaysToKey(lundi, i));
  const changements = chargerChangements(lundi, addDaysToKey(lundi, 6));

  return (
    <>
      <Entete
        contexte={
          semaine ? `Semaine ${semaine.number} (${semaine.letter})` : 'Hors semaines de cours'
        }
        titre={titreSemaine(lundi)}
        compact
        aside={
          <div className="flex gap-1">
            <Link
              href={`/calendrier?semaine=${addDaysToKey(lundi, -7)}`}
              aria-label="Semaine précédente"
              className="rounded-full p-2 text-gris hover:text-encre"
            >
              <ChevronLeft size={24} />
            </Link>
            <Link
              href={`/calendrier?semaine=${addDaysToKey(lundi, 7)}`}
              aria-label="Semaine suivante"
              className="rounded-full p-2 text-gris hover:text-encre"
            >
              <ChevronRight size={24} />
            </Link>
          </div>
        }
      />
      {lundi !== lundiDe(aujourdhui) && (
        <Link href="/calendrier" className="-mt-5 mb-6 inline-block text-[15px] underline">
          Revenir à cette semaine
        </Link>
      )}

      <ol className="grid gap-3 lg:grid-cols-2">
        {jours.map((jour) => {
          const seances = seancesDuJour(jour, data, changements);
          const evenements = eventsOn(jour, data.events);
          const estAujourdhui = jour === aujourdhui;
          return (
            <li
              key={jour}
              aria-current={estAujourdhui ? 'date' : undefined}
              className={`bloc p-4 ${estAujourdhui ? 'bg-jaune text-sur-couleur' : 'bg-surface'}`}
            >
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p
                  className={`text-[17px] first-letter:uppercase ${estAujourdhui ? 'font-semibold' : 'font-medium'}`}
                >
                  {formatDayKey(jour, 'EEEE d')}
                  {estAujourdhui && (
                    <span className="pastille ml-2 bg-encre align-middle text-[11px] text-jaune">
                      Aujourd’hui
                    </span>
                  )}
                </p>
                <p className="text-right text-[13px] text-gris">
                  {evenements
                    .map((e) => e.title + (e.status === 'a_confirmer' ? ' (à confirmer)' : ''))
                    .join(', ')}
                </p>
              </div>
              {seances.length > 0 ? (
                <>
                  <BarreDuJour
                    seances={seances}
                    matieres={matieres}
                    maintenant={estAujourdhui ? maintenant : undefined}
                  />
                  {seances
                    .filter((s) => s.changement)
                    .map((s) => (
                      <div
                        key={`${s.start.toISOString()}-${s.subjectCode}`}
                        className="mt-2 text-[14px]"
                      >
                        <span className="font-bold">
                          {matieres.get(s.subjectCode)?.name ?? s.subjectCode}
                        </span>{' '}
                        <span className="chiffres text-gris">{formatTunis(s.start, 'HH:mm')}</span>
                        <DetailsChangement seance={s} />
                      </div>
                    ))}
                </>
              ) : (
                <p className="text-[15px] text-gris">Pas de cours</p>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
