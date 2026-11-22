import Link from 'next/link';
import { formatTunis } from '@tandhim/core';
import { epreuvesAVenir, listerSeancesRevision, reglagesRevision } from '@tandhim/db';
import { reglerRevisionAction } from '@/app/(app)/actions';
import { Entete, TitreSection } from '@/components/entete';
import { LienRetour } from '@/components/retour';
import { SeanceRevisionLigne } from '@/components/seance-revision';
import { getDb } from '@/lib/db';
import { chargerMatieres } from '@/lib/donnees';
import { maintenant as maintenantApp } from '@/lib/apercu';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Révisions' };

const REGLAGES = [
  {
    nom: 'joursAvant',
    titre: 'Commencer',
    options: [
      { v: 7, l: '7 jours avant' },
      { v: 10, l: '10 jours avant' },
      { v: 14, l: '14 jours avant' },
    ],
  },
  {
    nom: 'seancesParEpreuve',
    titre: 'Séances par épreuve',
    options: [
      { v: 2, l: '2' },
      { v: 4, l: '4' },
      { v: 6, l: '6' },
    ],
  },
  {
    nom: 'dureeMin',
    titre: 'Durée d’une séance',
    options: [
      { v: 60, l: '1 h' },
      { v: 90, l: '1 h 30' },
      { v: 120, l: '2 h' },
    ],
  },
] as const;

export default function Revisions() {
  const { db } = getDb();
  const maintenant = maintenantApp();
  const epreuves = epreuvesAVenir(db, maintenant);
  const seances = listerSeancesRevision(
    db,
    new Date(maintenant.getTime() - 30 * 86_400_000),
    new Date(maintenant.getTime() + 120 * 86_400_000),
  );
  const reglages = reglagesRevision(db);
  const matieres = chargerMatieres();

  return (
    <div className="max-w-2xl">
      <LienRetour href="/plus">Plus</LienRetour>
      <Entete titre="Révisions" />
      <p className="mb-6 text-[16px] text-gris">
        Avant chaque DS ou examen daté, des séances de révision sont placées dans tes créneaux
        libres (le soir après les cours, en journée les jours sans cours). Le planning se recalcule
        si une date change ; une séance cochée reste acquise.
      </p>

      {epreuves.length === 0 ? (
        <div className="mb-8 rounded-[18px] border-2 border-dashed border-encre p-4 text-[15px]">
          <p className="font-semibold">Aucune épreuve datée à venir.</p>
          <p className="text-gris">
            Les DS et examens annoncés par mail arrivent ici automatiquement. Tu peux aussi en
            ajouter : Nouvelle tâche → type DS ou Examen.
          </p>
          <Link
            href="/taches/nouvelle?retour=/revisions"
            className="bloc bloc-presse mt-3 inline-block bg-jaune px-4 py-2.5 font-bold text-sur-couleur"
          >
            Ajouter une épreuve
          </Link>
        </div>
      ) : (
        epreuves.map((e) => {
          const m = e.matiere ? matieres.get(e.matiere) : undefined;
          const liste = seances.filter((s) => s.epreuve.id === e.id);
          const faites = liste.filter((s) => s.faite).length;
          return (
            <section key={e.id} aria-labelledby={`ep-${e.id}`} className="bloc mb-4 bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={`ep-${e.id}`} className="text-[17px] font-bold leading-snug">
                    <Link href={`/taches/${e.id}?retour=/revisions`} className="hover:underline">
                      {e.titre}
                    </Link>
                  </h2>
                  <p className="text-[14px] text-gris first-letter:uppercase">
                    {formatTunis(e.debut, "EEEE d MMMM 'à' HH:mm")}
                    {m && ` · ${m.name}`}
                  </p>
                </div>
                <span className="pastille shrink-0 bg-papier">
                  {faites}/{liste.length} faites
                </span>
              </div>
              {liste.length === 0 ? (
                <p className="mt-3 text-[14px] text-gris">
                  Plus de créneau libre avant l’épreuve : révise quand tu peux.
                </p>
              ) : (
                <ul className="mt-2 divide-y-2 divide-dashed divide-ligne">
                  {liste.map((s) => (
                    <SeanceRevisionLigne
                      key={s.id}
                      id={s.id}
                      faite={s.faite}
                      quand={`${formatTunis(s.debut, 'EEE d MMM, HH:mm')}–${formatTunis(s.fin, 'HH:mm')}`}
                      titre={s.debut < maintenant && !s.faite ? 'passée' : 'à faire'}
                      couleur={m?.color}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

      <section aria-labelledby="reglages" className="mb-8 mt-8">
        <TitreSection id="reglages">Réglages</TitreSection>
        <form action={reglerRevisionAction} className="flex flex-col gap-4">
          {REGLAGES.map((r) => (
            <fieldset key={r.nom}>
              <legend className="mb-1.5 text-[14px] font-semibold">{r.titre}</legend>
              <div className="flex flex-wrap gap-2">
                {r.options.map((o) => (
                  <label key={o.v} className="cursor-pointer">
                    <input
                      type="radio"
                      name={r.nom}
                      value={o.v}
                      defaultChecked={reglages[r.nom] === o.v}
                      className="peer sr-only"
                    />
                    <span className="flex h-11 items-center rounded-xl border-2 border-encre bg-surface px-4 text-[15px] font-semibold peer-checked:bg-encre peer-checked:text-papier peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-bleu">
                      {o.l}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button
            type="submit"
            className="bloc bloc-presse w-fit bg-jaune px-5 py-2.5 text-[16px] font-bold text-sur-couleur"
          >
            Enregistrer et recalculer
          </button>
        </form>
      </section>
    </div>
  );
}
