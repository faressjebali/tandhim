import { Entete } from '@/components/entete';
import { FormulaireProjet } from '@/components/formulaires';
import { LienRetour } from '@/components/retour';
import { optionsFormulaires } from '@/lib/donnees';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouveau projet' };

export default function NouveauProjet() {
  return (
    <div className="max-w-xl">
      <LienRetour href="/projets">Projets</LienRetour>
      <Entete titre="Nouveau projet" />
      <FormulaireProjet matieres={optionsFormulaires().matieres} />
    </div>
  );
}
