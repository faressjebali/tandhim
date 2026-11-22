import { Annulations } from '@/components/annulation';
import { EtatConnexion } from '@/components/etat-connexion';
import { Navigation } from '@/components/navigation';
import { Raccourcis } from '@/components/raccourcis';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EtatConnexion />
      <Annulations />
      <Raccourcis />
      <Navigation />
      <div className="pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:pb-0 lg:pl-60">
        <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-5 lg:max-w-6xl lg:px-10 lg:pb-12 lg:pt-12">
          {process.env.TANDHIM_DEMO === '1' && (
            <p className="mb-4 inline-block rounded-full border-2 border-dashed border-ligne px-3 py-1 text-[13px] font-semibold text-gris">
              Mode démo · données fictives
            </p>
          )}
          {children}
        </main>
      </div>
    </>
  );
}
