import { addDaysToKey, daysBetween, tunisDayKey } from '@tandhim/core';
import { listerTaches } from '@tandhim/db';
import { BoutonAjouter } from '@/components/bouton-ajouter';
import { Entete, TitreSection } from '@/components/entete';
import { LigneTache } from '@/components/tache';
import { getDb } from '@/lib/db';
import { chargerTachesTriees, versVue } from '@/lib/donnees';
import { maintenant as maintenantApp } from '@/lib/apercu';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'À faire' };

type Groupe = 'retard' | 'aConfirmer' | 'aujourdhui' | 'semaine' | 'plusTard' | 'sansDate';
const TITRES: Record<Groupe, string> = {
  retard: 'En retard',
  aConfirmer: 'Échéance passée : rendu ?',
  aujourdhui: 'Aujourd’hui',
  semaine: 'Cette semaine',
  plusTard: 'Plus tard',
  sansDate: 'Sans échéance',
};

export default function AFaire() {
  const maintenant = maintenantApp();
  const jour = tunisDayKey(maintenant);
  const taches = chargerTachesTriees(maintenant);
  const groupes = new Map<Groupe, typeof taches>();
  for (const t of taches) {
    const g: Groupe = !t.echeance
      ? 'sansDate'
      : t.echeance < maintenant
        ? t.renduIncertain
          ? 'aConfirmer'
          : 'retard'
        : tunisDayKey(t.echeance) === jour
          ? 'aujourdhui'
          : daysBetween(jour, tunisDayKey(t.echeance)) < 7
            ? 'semaine'
            : 'plusTard';
    groupes.set(g, [...(groupes.get(g) ?? []), t]);
  }
  // Terminées ces 7 derniers jours, pour pouvoir décocher une erreur.
  const depuis = addDaysToKey(jour, -7);
  const terminees = listerTaches(getDb().db)
    .filter((t) => t.statut === 'termine' && t.termineLe && tunisDayKey(t.termineLe) >= depuis)
    .sort((a, b) => b.termineLe!.getTime() - a.termineLe!.getTime());

  return (
    <>
      <Entete
        contexte={
          taches.length
            ? `${taches.length} tâche${taches.length > 1 ? 's' : ''} à faire`
            : 'Tout est fait'
        }
        titre="À faire"
      />
      {taches.length === 0 && (
        <div className="mb-8 rounded-[18px] border-2 border-dashed border-encre p-4 text-[15px]">
          <p className="font-semibold">Aucune tâche en attente.</p>
          <p className="text-gris">Ajoute une tâche avec le bouton +.</p>
        </div>
      )}
      <div className="max-w-2xl">
        {(Object.keys(TITRES) as Groupe[]).map((g) => {
          const liste = groupes.get(g);
          if (!liste?.length) return null;
          return (
            <section key={g} aria-labelledby={`g-${g}`} className="mb-8">
              <TitreSection id={`g-${g}`}>
                <span className={g === 'retard' ? 'text-corail' : ''}>{TITRES[g]}</span>
              </TitreSection>
              <ul className="flex flex-col gap-2.5">
                {liste.map((t) => (
                  <LigneTache key={t.id} tache={versVue(t, maintenant)} retour="/a-faire" />
                ))}
              </ul>
            </section>
          );
        })}
        {terminees.length > 0 && (
          <details className="mb-8">
            <summary className="titre cursor-pointer text-[18px]">
              Terminées cette semaine ({terminees.length})
            </summary>
            <ul className="mt-3 flex flex-col gap-2.5">
              {terminees.map((t) => (
                <LigneTache key={t.id} tache={versVue(t, maintenant)} retour="/a-faire" />
              ))}
            </ul>
          </details>
        )}
      </div>
      <BoutonAjouter retour="/a-faire" />
    </>
  );
}
