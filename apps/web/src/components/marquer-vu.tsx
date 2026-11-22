'use client';

import { useEffect } from 'react';
import { marquerInfosVues } from '@/app/(app)/actions';

/** À l'ouverture de la tâche, ses nouvelles infos sont considérées comme vues. */
export function MarquerVu({ itemId }: { itemId: number }) {
  useEffect(() => {
    // Laisse le temps de voir la pastille « Nouvelle » avant qu'elle ne disparaisse au prochain affichage.
    const id = setTimeout(() => void marquerInfosVues(itemId), 1500);
    return () => clearTimeout(id);
  }, [itemId]);
  return null;
}
