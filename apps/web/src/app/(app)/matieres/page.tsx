import {
  SESSION_TYPE_LABELS,
  SLOT_TIMES,
  addDaysToKey,
  formatDayKey,
  sessionsBetween,
  tunisDayKey,
} from '@tandhim/core';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Entete } from '@/components/entete';
import { chargerCalendrier, chargerMatieres } from '@/lib/donnees';
import { maintenant as maintenantApp } from '@/lib/apercu';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Matières' };

export default function Matieres() {
  const maintenant = maintenantApp();
  const jour = tunisDayKey(maintenant);
  const data = chargerCalendrier();
  const matieres = [...chargerMatieres().values()];
  const aVenir = sessionsBetween(jour, addDaysToKey(jour, 60), data).filter(
    (s) => s.end > maintenant,
  );

  return (
    <>
      <Entete contexte={`${matieres.length} matières ce semestre`} titre="Matières" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {matieres.map((m) => {
          const prochaine = aVenir.find((s) => s.subjectCode === m.code);
          return (
            <li key={m.code}>
              <Link
                href={`/matieres/${encodeURIComponent(m.code)}`}
                className="bloc bloc-presse flex h-full gap-3 bg-surface p-4"
              >
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-encre text-[12px] font-bold text-sur-couleur"
                  style={{ background: m.color }}
                >
                  {m.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold leading-snug">{m.name}</p>
                  <p className="text-[15px] text-gris">{m.teacher}</p>
                  <p className="mt-1 text-[15px]">
                    {prochaine ? (
                      <>
                        <span className="text-gris">Prochaine séance </span>
                        <span className="first-letter:uppercase">
                          {formatDayKey(prochaine.date, 'EEEE d MMMM')}
                        </span>
                        <span className="chiffres"> à {SLOT_TIMES[prochaine.slot].start}</span>
                        <span className="text-gris">, {SESSION_TYPE_LABELS[prochaine.type]}</span>
                      </>
                    ) : (
                      <span className="text-gris">Aucune séance prévue d’ici deux mois</span>
                    )}
                  </p>
                  {m.submissionsViaClassroom && (
                    <p className="mt-2">
                      <span className="pastille bg-jaune text-sur-couleur">
                        Rendus sur Classroom
                      </span>
                    </p>
                  )}
                </div>
                <ChevronRight size={20} aria-hidden className="shrink-0 self-center" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
