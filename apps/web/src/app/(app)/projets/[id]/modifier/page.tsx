import { notFound } from 'next/navigation';
import { trouverProjet } from '@tandhim/db';
import { effacerProjet } from '@/app/(app)/actions';
import { Entete } from '@/components/entete';
import { FormulaireProjet } from '@/components/formulaires';
import { LienRetour } from '@/components/retour';
import { getDb } from '@/lib/db';
import { optionsFormulaires } from '@/lib/donnees';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Modifier le projet' };

export default async function ModifierProjet({ params }: { params: Promise<{ id: string }> }) {
  const p = trouverProjet(getDb().db, Number((await params).id));
  if (!p) notFound();
  return (
    <div className="max-w-xl">
      <LienRetour href={`/projets/${p.id}`}>{p.titre}</LienRetour>
      <Entete titre="Modifier le projet" />
      <FormulaireProjet
        matieres={optionsFormulaires().matieres}
        valeurs={{
          id: p.id,
          titre: p.titre,
          type: p.type,
          matiereId: p.matiere?.id,
          description: p.description,
          echeance: p.echeance,
          couleur: p.type === 'perso' ? p.couleur : null,
        }}
      />
      <form action={effacerProjet} className="mt-8">
        <input type="hidden" name="id" value={p.id} />
        <button type="submit" className="text-[16px] font-semibold text-corail underline">
          Supprimer le projet et ses tâches
        </button>
      </form>
    </div>
  );
}
