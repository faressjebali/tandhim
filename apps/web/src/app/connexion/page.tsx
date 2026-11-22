import type { Metadata } from 'next';
import { authConfigured } from '@/lib/auth';
import { Marque } from '@/components/marque';
import { FormulaireConnexion } from './formulaire';

export const metadata: Metadata = { title: 'Connexion' };
export const dynamic = 'force-dynamic';

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  const { suite } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-10 px-5 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <Marque grande />
      {authConfigured() ? (
        <FormulaireConnexion suite={suite} />
      ) : (
        <div className="flex flex-col gap-2 text-[15px]">
          <p className="font-medium">Le mot de passe n’est pas encore configuré.</p>
          <p className="text-gris">
            Sur le PC, lance <code className="text-encre">pnpm mot-de-passe</code>, puis redéploie
            l’app. La procédure est décrite dans docs/serveur.md.
          </p>
        </div>
      )}
    </main>
  );
}
