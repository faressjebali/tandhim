'use client';

import { useEffect, useState } from 'react';

interface Annulation {
  cle: number;
  texte: string;
  annuler: () => void;
}

/** Durée pendant laquelle « Annuler » reste proposé. */
const DUREE_MS = 5000;
let afficher: ((a: Annulation) => void) | null = null;

/**
 * Propose « Annuler » quelques secondes après une action rapide (tâche terminée, reportée…).
 * Affiché au niveau de l'app : reste visible même si la tâche quitte la liste.
 */
export function proposerAnnulation(texte: string, annuler: () => void): void {
  afficher?.({ cle: Date.now(), texte, annuler });
}

export function Annulations() {
  const [a, setA] = useState<Annulation | null>(null);

  useEffect(() => {
    afficher = setA;
    return () => {
      afficher = null;
    };
  }, []);

  useEffect(() => {
    if (!a) return;
    const id = setTimeout(() => setA(null), DUREE_MS);
    return () => clearTimeout(id);
  }, [a]);

  if (!a) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.5rem)] z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border-2 border-encre bg-encre px-4 py-2 text-[15px] text-papier shadow-[3px_3px_0_var(--ombre)] lg:bottom-8"
    >
      <span className="font-semibold">{a.texte}</span>
      <button
        type="button"
        onClick={() => {
          setA(null);
          a.annuler();
        }}
        className="min-h-11 px-2 font-bold text-jaune underline"
      >
        Annuler
      </button>
    </div>
  );
}
