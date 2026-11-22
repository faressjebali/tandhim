import 'server-only';
import { estModeDemo, maintenantDemo } from '@tandhim/core';

/**
 * Instant « maintenant » de la page. En mode aperçu (TANDHIM_APERCU=1, jamais en production),
 * `?a=2026-11-23T10:00` simule une date et une heure de Tunis pour vérifier les écrans.
 */
export function maintenantPour(param: string | undefined): Date {
  if (
    process.env.TANDHIM_APERCU === '1' &&
    param &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(param)
  ) {
    return new Date(`${param}:00+01:00`);
  }
  // Mode démo : l'année du calendrier de départ (2026/2027), même plus tard.
  return estModeDemo() ? maintenantDemo() : new Date();
}

/** L'instant « maintenant » de l'app : horloge de démo en mode démo, sinon l'heure réelle. */
export const maintenant = (): Date => maintenantPour(undefined);
