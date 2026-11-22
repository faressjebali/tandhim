/**
 * Rappels d'échéance (notifications Web Push) : quand envoyer, et quoi écrire.
 * Par défaut 2 jours avant (choix de Fares, SPEC §3.4) ; jamais la nuit.
 */
import { libelleEcheance } from './taches';
import { addDaysToKey, formatTunis, tunisDayKey, tunisInstantOn } from './time';

export const DELAI_RAPPEL_DEFAUT_HEURES = 48;
export const DELAIS_RAPPEL_HEURES = [24, 48, 72] as const;

/** Nuit (heure de Tunis) : aucune notification entre 22:00 et 07:30. */
const DEBUT_NUIT = '22:00';
const FIN_NUIT = '07:30';
/** Un rappel qui tomberait la nuit part la veille au soir, à cette heure. */
const SOIR = '21:00';

export function estLaNuit(instant: Date): boolean {
  const hhmm = formatTunis(instant, 'HH:mm');
  return hhmm >= DEBUT_NUIT || hhmm < FIN_NUIT;
}

/** Moment où le rappel doit partir : échéance − délai, avancé à 21:00 s'il tombe la nuit. */
export function momentRappel(echeance: Date, delaiHeures: number): Date {
  const brut = new Date(echeance.getTime() - delaiHeures * 3_600_000);
  if (!estLaNuit(brut)) return brut;
  const jour = tunisDayKey(brut);
  const hhmm = formatTunis(brut, 'HH:mm');
  // 22:00–23:59 → le soir même ; 00:00–07:29 → la veille au soir.
  return tunisInstantOn(hhmm >= DEBUT_NUIT ? jour : addDaysToKey(jour, -1), SOIR);
}

/** Faut-il envoyer le rappel maintenant ? (échéance pas encore passée, moment atteint, pas la nuit) */
export function rappelDu(echeance: Date, delaiHeures: number, maintenant: Date): boolean {
  return (
    echeance > maintenant &&
    momentRappel(echeance, delaiHeures) <= maintenant &&
    !estLaNuit(maintenant)
  );
}

export function texteRappel(
  t: { titre: string; matiere: string | null; echeance: Date; jourEntier: boolean },
  maintenant: Date,
): { titre: string; corps: string } {
  const { texte } = libelleEcheance(t.echeance, t.jourEntier, maintenant);
  const quand = texte.charAt(0).toLowerCase() + texte.slice(1);
  return { titre: `${t.matiere ?? 'À faire'} · ${quand}`, corps: t.titre };
}
