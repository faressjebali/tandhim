'use client';

import { useOptimistic, useTransition } from 'react';
import { Check } from 'lucide-react';
import { basculerSeanceRevisionAction } from '@/app/(app)/actions';

/** Séance de révision cochable (affichage immédiat). */
export function SeanceRevisionLigne({
  id,
  faite: initiale,
  quand,
  titre,
  couleur,
}: {
  id: number;
  faite: boolean;
  quand: string;
  titre: string;
  couleur?: string;
}) {
  const [faite, marquer] = useOptimistic(initiale);
  const [, demarrer] = useTransition();
  return (
    <li className={`flex items-center gap-3 py-2 ${faite ? 'opacity-55' : ''}`}>
      <button
        type="button"
        aria-pressed={faite}
        aria-label={faite ? `Séance du ${quand} : à refaire` : `Séance du ${quand} : faite`}
        onClick={() =>
          demarrer(async () => {
            marquer(!faite);
            await basculerSeanceRevisionAction(id, !faite);
          })
        }
        className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-encre before:absolute before:-inset-2 before:content-[''] ${
          faite ? 'bg-vert text-white' : 'bg-papier'
        }`}
      >
        {faite && <Check size={18} strokeWidth={3} aria-hidden />}
      </button>
      {couleur && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 rounded-md border-2 border-encre"
          style={{ background: couleur }}
        />
      )}
      <span className={`min-w-0 flex-1 text-[15px] ${faite ? 'line-through' : ''}`}>
        <span className="chiffres font-semibold">{quand}</span>
        <span className="text-gris"> · {titre}</span>
      </span>
    </li>
  );
}
