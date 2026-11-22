import Link from 'next/link';
import type { Projet } from '@tandhim/db';

/** Carte colorée d'un projet : nom, type, avancement, échéance. */
export function CarteProjet({
  projet,
  echeance,
  large = false,
}: {
  projet: Projet;
  echeance?: string;
  large?: boolean;
}) {
  return (
    <Link
      href={`/projets/${projet.id}`}
      className={`bloc bloc-presse flex shrink-0 snap-start flex-col justify-between gap-4 p-4 text-sur-couleur ${large ? 'w-full' : 'w-[15.5rem]'}`}
      style={{ background: projet.couleur }}
    >
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex gap-1.5">
            <span className="pastille bg-white/70">
              {projet.type === 'cours' ? (projet.matiere?.code ?? 'Cours') : 'Perso'}
            </span>
            {projet.aVerifier && <span className="pastille bg-jaune">À vérifier</span>}
          </span>
          {echeance && <span className="text-[13px] font-semibold">{echeance}</span>}
        </div>
        <p className="titre line-clamp-2 text-[19px] leading-snug">{projet.titre}</p>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[13px] font-semibold">
          <span>
            {projet.tachesTotal
              ? `${projet.tachesFaites}/${projet.tachesTotal} tâches`
              : 'Aucune tâche'}
          </span>
          <span className="chiffres">{projet.avancement} %</span>
        </div>
        <div className="h-3.5 overflow-hidden rounded-full border-2 border-[#1e1b2e] bg-white/80">
          <div className="h-full bg-[#1e1b2e]" style={{ width: `${projet.avancement}%` }} />
        </div>
      </div>
    </Link>
  );
}

/** Carte « nouveau projet » (pointillés), pour les listes vides ou en fin de liste. */
export function CarteNouveauProjet({ large = false }: { large?: boolean }) {
  return (
    <Link
      href="/projets/nouveau"
      className={`flex min-h-36 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-[18px] border-2 border-dashed border-encre p-4 text-center ${large ? 'w-full' : 'w-[12rem]'}`}
    >
      <span className="text-[28px] font-bold leading-none">+</span>
      <span className="text-[15px] font-semibold">Nouveau projet</span>
      <span className="text-[13px] text-gris">Fac ou perso</span>
    </Link>
  );
}
