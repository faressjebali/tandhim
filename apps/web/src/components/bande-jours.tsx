'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

export interface JourBande {
  date: string;
  abrege: string;
  numero: string;
  mois: string;
  /** Il y a cours ce jour-là (petit point sous le numéro). */
  cours: boolean;
}

/**
 * Bande de jours qu'on fait défiler : jour choisi dans un rond jaune, aujourd'hui souligné.
 * Toucher un jour l'affiche (paramètre ?jour=), sans recharger toute la page.
 */
export function BandeJours({
  jours,
  choisi,
  aujourdhui,
  chemin = '/',
}: {
  jours: JourBande[];
  choisi: string;
  aujourdhui: string;
  chemin?: string;
}) {
  const conteneur = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = conteneur.current?.querySelector<HTMLElement>('[data-choisi="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [choisi]);

  return (
    <ul
      ref={conteneur}
      className="defile-x -mx-5 mb-6 flex gap-1 px-5 py-1 lg:mx-0 lg:px-0"
      aria-label="Choisir un jour"
    >
      {jours.map((j, i) => {
        const estChoisi = j.date === choisi;
        const estAujourdhui = j.date === aujourdhui;
        const nouveauMois = i === 0 || j.date.slice(5, 7) !== jours[i - 1]!.date.slice(5, 7);
        return (
          <li key={j.date} className="flex shrink-0 snap-center flex-col items-center">
            <span className="h-4 text-[11px] font-semibold text-gris">
              {nouveauMois ? j.mois : ''}
            </span>
            <Link
              href={j.date === aujourdhui ? chemin : `${chemin}?jour=${j.date}`}
              scroll={false}
              data-choisi={estChoisi}
              aria-current={estChoisi ? 'date' : undefined}
              aria-label={`${j.abrege} ${j.numero}${estAujourdhui ? ', aujourd’hui' : ''}`}
              className="flex w-11 flex-col items-center gap-1 rounded-2xl py-1"
            >
              <span className={`text-[12px] font-medium ${estChoisi ? 'text-encre' : 'text-gris'}`}>
                {j.abrege}
              </span>
              <span
                className={`chiffres flex h-10 w-10 items-center justify-center rounded-full text-[16px] font-bold ${
                  estChoisi
                    ? 'border-2 border-encre bg-jaune text-sur-couleur shadow-[2px_2px_0_var(--ombre)]'
                    : estAujourdhui
                      ? 'border-2 border-encre'
                      : 'border-2 border-transparent'
                }`}
              >
                {j.numero}
              </span>
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${j.cours ? 'bg-encre' : 'bg-transparent'}`}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
