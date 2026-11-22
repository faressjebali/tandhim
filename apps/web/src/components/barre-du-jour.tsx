import {
  SESSION_TYPE_LABELS,
  SLOT_TIMES,
  type SeanceAffichee,
  type SlotCode,
  formatTunis,
  seanceSupprimee,
} from '@tandhim/core';
import { Wifi } from 'lucide-react';
import type { Matieres } from '@/lib/donnees';

const CRENEAUX: SlotCode[] = ['C1', 'C2', 'C3', 'C4', 'C5'];
const LIBELLES: Record<string, string> = {
  annulee: 'annulée',
  reportee: 'reportée',
  en_ligne: 'en ligne',
  rattrapage: 'rattrapage',
  changement_salle: 'changement de salle',
};
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};
const DEBUT = minutes(SLOT_TIMES.C1.start);
const FIN = minutes(SLOT_TIMES.C5.end);
const pct = (m: number) => ((m - DEBUT) / (FIN - DEBUT)) * 100;

/**
 * La barre du jour : les cinq créneaux INSAT sur l'axe 08:00 → 17:15 (la pause de midi
 * apparaît d'elle-même). Plein = séance (couleur de la matière), TP hachuré, pointillé = libre,
 * séance annulée ou reportée = contour pointillé et code barré.
 */
export function BarreDuJour({
  seances,
  matieres,
  maintenant,
  grande = false,
}: {
  seances: SeanceAffichee[];
  matieres: Matieres;
  maintenant?: Date;
  grande?: boolean;
}) {
  // Si un rattrapage occupe le créneau d'une séance annulée, la séance qui a lieu l'emporte.
  const parCreneau = new Map<SlotCode, SeanceAffichee>();
  // Les séances hors créneau (le soir…) ne sont pas dans la barre : elles sont dans la liste.
  for (const s of seances) {
    if (!s.slot) continue;
    const deja = parCreneau.get(s.slot);
    if (!deja || seanceSupprimee(deja)) parCreneau.set(s.slot, s);
  }
  const minuteNow = maintenant
    ? Number(formatTunis(maintenant, 'H')) * 60 + Number(formatTunis(maintenant, 'm'))
    : undefined;
  const resume = seances.length
    ? seances
        .map(
          (s) =>
            `${formatTunis(s.start, 'HH:mm')} ${matieres.get(s.subjectCode)?.name ?? s.subjectCode} (${SESSION_TYPE_LABELS[s.type]}${s.changement ? `, ${LIBELLES[s.ajoutee?.nature ?? s.changement.nature]}` : ''})`,
        )
        .join(', ')
    : 'aucune séance';

  return (
    <div className="w-full">
      <div
        role="img"
        aria-label={`Journée : ${resume}`}
        className={`relative w-full ${grande ? 'h-12' : 'h-8'}`}
      >
        {CRENEAUX.map((c) => {
          const s = parCreneau.get(c);
          const supprimee = s ? seanceSupprimee(s) : false;
          const couleur = s && !supprimee ? matieres.get(s.subjectCode)?.color : undefined;
          const debut = minutes(SLOT_TIMES[c].start);
          return (
            <div
              key={c}
              className={`absolute inset-y-0 overflow-hidden rounded-xl border-2 ${
                s && !supprimee
                  ? 'border-encre shadow-[2px_2px_0_var(--ombre)]'
                  : s
                    ? 'border-dashed border-encre'
                    : 'border-dashed border-ligne'
              }`}
              style={{
                left: `${pct(debut)}%`,
                width: `calc(${pct(debut + 90) - pct(debut)}% - 2px)`,
                background:
                  s?.type === 'TP' && couleur
                    ? `repeating-linear-gradient(135deg, rgb(30 27 46 / 0.16) 0 3px, transparent 3px 8px), ${couleur}`
                    : couleur,
              }}
            >
              {s && (
                <span
                  className={`absolute inset-0 flex items-center justify-center gap-0.5 font-bold ${
                    supprimee ? 'text-gris line-through' : 'text-sur-couleur'
                  } ${grande ? 'text-[13px]' : 'text-[11px]'}`}
                >
                  {s.subjectCode}
                  {s.changement?.nature === 'en_ligne' && (
                    <Wifi size={grande ? 14 : 11} strokeWidth={3} aria-hidden />
                  )}
                </span>
              )}
            </div>
          );
        })}
        {minuteNow !== undefined && minuteNow >= DEBUT && minuteNow <= FIN && (
          <div
            aria-hidden
            className="absolute -inset-y-2 w-1 -translate-x-1/2 rounded-full border border-encre bg-corail"
            style={{ left: `${pct(minuteNow)}%` }}
          />
        )}
      </div>
      {grande && (
        <div className="chiffres relative mt-1.5 h-4 text-[12px] font-medium text-gris" aria-hidden>
          {CRENEAUX.map((c) => (
            <span
              key={c}
              className="absolute"
              style={{ left: `${pct(minutes(SLOT_TIMES[c].start))}%` }}
            >
              {SLOT_TIMES[c].start}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
