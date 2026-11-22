'use client';

import Link from 'next/link';
import { useOptimistic, useRef, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import type { StatutTache } from '@tandhim/core';
import { deplacerTache } from '@/app/(app)/actions';
import type { TacheVue } from './tache';

const COLONNES: { statut: StatutTache; titre: string; fond: string }[] = [
  { statut: 'a_faire', titre: 'À faire', fond: 'bg-surface' },
  { statut: 'en_cours', titre: 'En cours', fond: 'bg-jaune/40' },
  { statut: 'termine', titre: 'Terminé', fond: 'bg-vert/25' },
];

export interface CarteKanban extends TacheVue {
  statut: StatutTache;
}

/**
 * Tableau Kanban d'un projet : glisser une carte par sa poignée (doigt ou souris) vers une autre
 * colonne, ou utiliser les flèches ◀ ▶ (pratiques au doigt et au clavier). Mise à jour immédiate.
 */
export function Kanban({ cartes, retour }: { cartes: CarteKanban[]; retour: string }) {
  const [etat, deplacer] = useOptimistic(
    cartes,
    (liste, { id, statut }: { id: number; statut: StatutTache }) =>
      liste.map((c) => (c.id === id ? { ...c, statut } : c)),
  );
  const [, demarrer] = useTransition();
  const [glisse, setGlisse] = useState<{ id: number; x: number; y: number } | null>(null);
  const [survol, setSurvol] = useState<StatutTache | null>(null);
  const fantome = useRef<{ dx: number; dy: number; largeur: number }>({ dx: 0, dy: 0, largeur: 0 });

  const changer = (id: number, statut: StatutTache) =>
    demarrer(async () => {
      deplacer({ id, statut });
      await deplacerTache(id, statut);
    });

  const colonneSous = (x: number, y: number): StatutTache | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-colonne]');
    return (el?.dataset.colonne as StatutTache | undefined) ?? null;
  };

  const debut = (e: React.PointerEvent, id: number) => {
    const carte = (e.currentTarget as HTMLElement).closest('li')!.getBoundingClientRect();
    fantome.current = {
      dx: e.clientX - carte.left,
      dy: e.clientY - carte.top,
      largeur: carte.width,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setGlisse({ id, x: e.clientX, y: e.clientY });
  };
  const mouvement = (e: React.PointerEvent) => {
    if (!glisse) return;
    setGlisse({ ...glisse, x: e.clientX, y: e.clientY });
    setSurvol(colonneSous(e.clientX, e.clientY));
  };
  const fin = (e: React.PointerEvent) => {
    if (!glisse) return;
    const cible = colonneSous(e.clientX, e.clientY);
    const carte = etat.find((c) => c.id === glisse.id);
    if (cible && carte && cible !== carte.statut) changer(glisse.id, cible);
    setGlisse(null);
    setSurvol(null);
  };

  const enCours = glisse ? etat.find((c) => c.id === glisse.id) : undefined;

  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-2 lg:mx-0 lg:px-0">
      <div className="grid min-w-[42rem] grid-cols-3 gap-3">
        {COLONNES.map((col, i) => {
          const liste = etat.filter((c) => c.statut === col.statut);
          return (
            <section
              key={col.statut}
              data-colonne={col.statut}
              aria-label={`${col.titre} (${liste.length})`}
              className={`bloc min-h-40 p-2.5 ${col.fond} ${
                survol === col.statut ? 'outline outline-3 outline-offset-2 outline-encre' : ''
              }`}
            >
              <h3 className="mb-2 flex items-baseline justify-between px-1 text-[15px] font-bold">
                {col.titre}
                <span className="chiffres text-[13px] font-semibold text-gris">{liste.length}</span>
              </h3>
              <ul className="flex flex-col gap-2">
                {liste.map((c) => (
                  <li
                    key={c.id}
                    className={`rounded-xl border-2 border-encre bg-surface p-2 shadow-[2px_2px_0_var(--ombre)] ${
                      glisse?.id === c.id ? 'opacity-30' : ''
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      <button
                        type="button"
                        aria-label={`Déplacer « ${c.titre} » (glisser)`}
                        onPointerDown={(e) => debut(e, c.id)}
                        onPointerMove={mouvement}
                        onPointerUp={fin}
                        onPointerCancel={() => {
                          setGlisse(null);
                          setSurvol(null);
                        }}
                        style={{ touchAction: 'none' }}
                        className="-ml-1 flex h-9 w-7 shrink-0 cursor-grab items-center justify-center text-gris active:cursor-grabbing"
                      >
                        <GripVertical size={18} aria-hidden />
                      </button>
                      <Link
                        href={`/taches/${c.id}?retour=${encodeURIComponent(retour)}`}
                        className={`min-w-0 flex-1 pt-1 text-[14px] font-semibold leading-snug ${
                          c.statut === 'termine' ? 'line-through opacity-60' : ''
                        }`}
                      >
                        {c.titre}
                        <span className="mt-1 block text-[12px] font-medium text-gris">
                          {c.echeance.texte}
                        </span>
                      </Link>
                    </div>
                    <div className="mt-1 flex justify-end gap-1">
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => changer(c.id, COLONNES[i - 1]!.statut)}
                          aria-label={`Mettre « ${c.titre} » dans ${COLONNES[i - 1]!.titre}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ligne"
                        >
                          <ChevronLeft size={18} aria-hidden />
                        </button>
                      )}
                      {i < COLONNES.length - 1 && (
                        <button
                          type="button"
                          onClick={() => changer(c.id, COLONNES[i + 1]!.statut)}
                          aria-label={`Mettre « ${c.titre} » dans ${COLONNES[i + 1]!.titre}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ligne"
                        >
                          <ChevronRight size={18} aria-hidden />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
                {liste.length === 0 && (
                  <li className="rounded-xl border-2 border-dashed border-ligne p-3 text-center text-[13px] text-gris">
                    Dépose une carte ici
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {glisse && enCours && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 rotate-2 rounded-xl border-2 border-encre bg-surface p-2 text-[14px] font-semibold shadow-[4px_4px_0_var(--ombre)]"
          style={{
            left: glisse.x - fantome.current.dx,
            top: glisse.y - fantome.current.dy,
            width: fantome.current.largeur,
          }}
        >
          {enCours.titre}
        </div>
      )}
    </div>
  );
}
