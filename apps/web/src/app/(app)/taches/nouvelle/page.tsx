import { Entete } from '@/components/entete';
import { FormulaireTache } from '@/components/formulaires';
import { LienRetour } from '@/components/retour';
import { optionsFormulaires, retourSur } from '@/lib/donnees';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouvelle tâche' };

export default async function NouvelleTache({
  searchParams,
}: {
  searchParams: Promise<{ retour?: string; projet?: string; jour?: string }>;
}) {
  const p = await searchParams;
  const retour = retourSur(p.retour, '/');
  const { matieres, projets, matieresSaisie } = optionsFormulaires();
  const projetId = Number(p.projet) || null;
  return (
    <div className="max-w-xl">
      <LienRetour href={retour} />
      <Entete titre="Nouvelle tâche" />
      <FormulaireTache
        matieres={matieres}
        projets={projets}
        matieresSaisie={matieresSaisie}
        retour={retour}
        valeurs={{ projetId, echeanceJour: p.jour }}
      />
    </div>
  );
}
