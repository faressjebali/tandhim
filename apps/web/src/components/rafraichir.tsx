'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Garde l'écran à jour (séance en cours, repère de l'heure) quand l'app reste ouverte. */
export function Rafraichir({ toutesLesSecondes = 60 }: { toutesLesSecondes?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), toutesLesSecondes * 1000);
    const auRetour = () => document.visibilityState === 'visible' && router.refresh();
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [router, toutesLesSecondes]);
  return null;
}
