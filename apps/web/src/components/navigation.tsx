'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, FolderKanban, House, LayoutGrid, ListChecks, Search } from 'lucide-react';
import { Marque } from './marque';

const ONGLETS = [
  { href: '/', label: 'Aujourd’hui', Icone: House },
  { href: '/calendrier', label: 'Calendrier', Icone: CalendarDays },
  { href: '/a-faire', label: 'À faire', Icone: ListChecks },
  { href: '/projets', label: 'Projets', Icone: FolderKanban },
  { href: '/plus', label: 'Plus', Icone: LayoutGrid },
] as const;

function estActif(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** Barre d'onglets flottante (jaune, contour encre) sur mobile ; barre latérale sur ordinateur. */
export function Navigation() {
  const pathname = usePathname();
  // Onglet touché : allumé tout de suite, sans attendre l'arrivée de la page.
  const [cible, setCible] = useState<{ href: string; depuis: string } | null>(null);
  const courant = cible && cible.depuis === pathname ? cible.href : pathname;
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 lg:inset-y-0 lg:left-0 lg:right-auto lg:bottom-0 lg:w-64 lg:border-r-2 lg:border-encre lg:bg-papier"
    >
      <div className="hidden px-6 pb-8 pt-10 lg:block">
        <Marque />
      </div>
      <ul className="bloc mx-auto flex max-w-lg justify-around bg-jaune px-1 py-1.5 text-sur-couleur lg:mx-4 lg:max-w-none lg:flex-col lg:gap-1.5 lg:border-0 lg:bg-transparent lg:p-0 lg:text-encre lg:shadow-none">
        {ONGLETS.map(({ href, label, Icone }) => {
          const actif = estActif(courant, href);
          return (
            <li key={href} className="flex-1 lg:flex-none">
              <Link
                href={href}
                prefetch
                onClick={() => setCible({ href, depuis: pathname })}
                aria-current={estActif(pathname, href) ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] font-semibold transition-colors lg:flex-row lg:gap-3 lg:border-2 lg:px-4 lg:py-2.5 lg:text-[15px] ${
                  actif
                    ? 'bg-[#1e1b2e] text-jaune lg:border-encre lg:bg-jaune lg:text-sur-couleur lg:shadow-[3px_3px_0_var(--ombre)]'
                    : 'lg:border-transparent lg:hover:border-encre'
                }`}
              >
                <Icone aria-hidden size={22} strokeWidth={actif ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Sur ordinateur : recherche toujours à portée (Ctrl+K). */}
      <Link
        href="/recherche"
        className="mx-4 mt-6 hidden items-center gap-3 rounded-xl border-2 border-dashed border-encre px-4 py-2.5 text-[15px] font-semibold text-gris hover:text-encre lg:flex"
      >
        <Search aria-hidden size={20} />
        Rechercher
        <kbd className="ml-auto rounded-md border border-ligne px-1.5 text-[12px] font-medium">
          Ctrl K
        </kbd>
      </Link>
    </nav>
  );
}
