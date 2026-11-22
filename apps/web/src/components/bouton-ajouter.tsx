import Link from 'next/link';
import { Plus } from 'lucide-react';

/** Bouton flottant « + » : ajouter une tâche en deux secondes, depuis n'importe quel onglet. */
export function BoutonAjouter({ retour = '/' }: { retour?: string }) {
  return (
    <Link
      href={`/taches/nouvelle?retour=${encodeURIComponent(retour)}`}
      aria-label="Ajouter une tâche"
      className="bloc bloc-presse fixed bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] right-5 z-30 flex h-14 w-14 items-center justify-center bg-rose text-sur-couleur lg:bottom-8 lg:right-8"
      style={{ borderRadius: 999 }}
    >
      <Plus size={28} strokeWidth={2.8} aria-hidden />
    </Link>
  );
}
