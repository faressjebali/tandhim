import { SLOT_TIMES, type SeanceAffichee, estUnLien, formatDayKey } from '@tandhim/core';
import { ignorerChangementAction } from '@/app/(app)/actions';
import { maintenant as maintenantApp } from '@/lib/apercu';

/** Libellé court du changement d'une séance, et sa couleur. */
export function libelleChangement(s: SeanceAffichee): { texte: string; fond: string } | null {
  const c = s.changement;
  if (!c) return null;
  if (s.ajoutee?.nature === 'reportee' && s.ajoutee.depuis)
    return {
      texte: `Reportée du ${formatDayKey(s.ajoutee.depuis, 'EEE d/MM')}`,
      fond: 'bg-jaune text-sur-couleur',
    };
  if (s.ajoutee?.nature === 'rattrapage')
    return { texte: 'Rattrapage', fond: 'bg-jaune text-sur-couleur' };
  switch (c.nature) {
    case 'annulee':
      return { texte: 'Annulée', fond: 'bg-corail text-white' };
    case 'reportee':
      return {
        texte: c.nouveauJour
          ? `Reportée au ${formatDayKey(c.nouveauJour, 'EEE d/MM')}${c.nouveauCreneau ? ` à ${SLOT_TIMES[c.nouveauCreneau].start}` : c.nouvelleHeure ? ` à ${c.nouvelleHeure}` : ''}`
          : 'Reportée (date à venir)',
        fond: 'bg-corail text-white',
      };
    case 'en_ligne':
      return { texte: 'En ligne', fond: 'bg-bleu text-sur-couleur' };
    case 'changement_salle':
      return {
        texte: c.salle ? `Salle ${c.salle}` : 'Changement de salle',
        fond: 'bg-violet text-white',
      };
    default:
      return null;
  }
}

/** Pastille, lien de la séance en ligne (tant qu'elle n'est pas finie), source et « Ignorer ». */
export function DetailsChangement({ seance }: { seance: SeanceAffichee }) {
  const c = seance.changement;
  const libelle = libelleChangement(seance);
  if (!c || !libelle) return null;
  // Séance terminée : plus de lien ni de code pour la rejoindre (l'étiquette « En ligne » reste).
  const aRejoindre =
    c.nature === 'en_ligne' && new Date(seance.end).getTime() > maintenantApp().getTime();
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
      <span className={`pastille ${libelle.fond}`}>{libelle.texte}</span>
      {c.aVerifier && <span className="pastille bg-surface">À vérifier</span>}
      {aRejoindre && c.lien && !estUnLien(c.lien) && (
        <span className="font-semibold">
          Code Meet : <span className="chiffres select-all">{c.lien}</span>
        </span>
      )}
      {aRejoindre && estUnLien(c.lien) && (
        <a
          href={c.lien}
          target="_blank"
          rel="noreferrer"
          className="bloc bloc-presse inline-flex min-h-9 items-center bg-bleu px-3 font-bold text-sur-couleur"
        >
          Rejoindre
        </a>
      )}
      {c.lienSource && (
        <a href={c.lienSource} target="_blank" rel="noreferrer" className="font-semibold underline">
          Source
        </a>
      )}
      <form action={ignorerChangementAction} className="inline">
        <input type="hidden" name="id" value={c.id} />
        <button
          type="submit"
          className="min-h-9 font-semibold text-gris underline"
          aria-label={`Ignorer ce changement (${libelle.texte})`}
        >
          Ignorer
        </button>
      </form>
    </div>
  );
}
