'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Raccourcis clavier (PC) : Ctrl+K ou « / » = rechercher, « n » = nouvelle tâche. */
export function Raccourcis() {
  const router = useRouter();
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const enSaisie =
        cible?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible?.tagName ?? '');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/recherche');
      } else if (!enSaisie && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === '/') {
          e.preventDefault();
          router.push('/recherche');
        } else if (e.key === 'n') {
          router.push('/taches/nouvelle');
        }
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [router]);
  return null;
}
