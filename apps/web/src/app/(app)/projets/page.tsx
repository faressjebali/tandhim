import { tunisDayKey } from '@tandhim/core';
import { listerProjets } from '@tandhim/db';
import { CarteNouveauProjet, CarteProjet } from '@/components/carte-projet';
import { Entete, TitreSection } from '@/components/entete';
import { getDb } from '@/lib/db';
import { echeanceProjet } from '@/lib/donnees';
import { maintenant as maintenantApp } from '@/lib/apercu';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projets' };

export default function Projets() {
  const jour = tunisDayKey(maintenantApp());
  const tous = listerProjets(getDb().db);
  const enCours = tous.filter((p) => p.statut === 'en_cours');
  const termines = tous.filter((p) => p.statut === 'termine');
  return (
    <>
      <Entete contexte={`${enCours.length} en cours`} titre="Projets" />
      <div className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {enCours.map((p) => (
          <CarteProjet key={p.id} projet={p} echeance={echeanceProjet(p, jour)} large />
        ))}
        <CarteNouveauProjet large />
      </div>
      {termines.length > 0 && (
        <section aria-labelledby="termines">
          <TitreSection id="termines">Terminés</TitreSection>
          <div className="grid gap-4 opacity-70 sm:grid-cols-2 xl:grid-cols-3">
            {termines.map((p) => (
              <CarteProjet key={p.id} projet={p} large />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
