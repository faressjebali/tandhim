/**
 * Mode démo (TANDHIM_DEMO=1) : fausses données réalistes pour essayer l'app et faire des captures
 * d'écran, sans aucun compte ni aucune donnée réelle. Le calendrier de départ couvre l'année
 * 2026/2027 : hors de cette période, la démo se place au 24/11/2026 (à l'heure actuelle).
 */
import { formatTunis, tunisDayKey, tunisInstantOn } from './time';

export const DEMO_PERIODE = { debut: '2026-09-01', fin: '2027-06-30' } as const;
export const DEMO_JOUR_PAR_DEFAUT = '2026-11-24';

export const estModeDemo = (env: Record<string, string | undefined> = process.env) =>
  env.TANDHIM_DEMO === '1';

/**
 * « Maintenant » vu par la démo : `TANDHIM_DEMO_DATE` (AAAA-MM-JJTHH:MM, heure de Tunis) fige
 * l'horloge (captures d'écran cohérentes) ; sinon l'instant réel s'il tombe dans l'année du
 * calendrier, sinon le 24/11/2026 à l'heure actuelle.
 */
export function maintenantDemo(
  reel: Date = new Date(),
  fixe: string | undefined = process.env.TANDHIM_DEMO_DATE,
): Date {
  if (fixe && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fixe))
    return tunisInstantOn(fixe.slice(0, 10), fixe.slice(11));
  const jour = tunisDayKey(reel);
  if (jour >= DEMO_PERIODE.debut && jour <= DEMO_PERIODE.fin) return reel;
  return tunisInstantOn(DEMO_JOUR_PAR_DEFAUT, formatTunis(reel, 'HH:mm'));
}

/** Enseignants inventés (remplacent ceux de l'emploi du temps en mode démo). */
export const PROFS_DEMO: Record<string, string> = {
  STR: 'Mme Salma Haddad',
  PRM: 'Mme Amel Gharbi',
  THD: 'M. Karim Mansour',
  GF: 'Mme Nadia Chaabane',
  PU: 'Mme Rania Jaziri',
  TNS: 'Mme Leila Ferchichi',
  ANG: 'Mme Sarah Collins',
  COM: 'M. Hatem Ayari',
  ML: 'M. Walid Trabelsi',
  RHD: 'M. Sami Riahi',
  DROIT: 'Mme Ons Mejri',
  FW: 'M. Anis Sassi',
};
