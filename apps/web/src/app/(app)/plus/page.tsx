import Link from 'next/link';
import {
  Bell,
  BookOpen,
  ChevronRight,
  GraduationCap,
  Inbox,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';
import { Entete } from '@/components/entete';
import { Marque } from '@/components/marque';
import { seDeconnecter } from '@/app/connexion/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plus' };

export default function Plus() {
  return (
    <div className="max-w-xl">
      <Entete titre="Plus" />

      <nav aria-label="Réglages et outils" className="mb-8 flex flex-col gap-2.5">
        {[
          { href: '/recherche', label: 'Rechercher', Icone: Search },
          { href: '/revisions', label: 'Révisions', Icone: GraduationCap },
          { href: '/plus/notifications', label: 'Notifications', Icone: Bell },
          { href: '/matieres', label: 'Matières', Icone: BookOpen },
          {
            href: '/plus/comptes',
            label: 'Comptes, cours Classroom et dossiers Drive',
            Icone: UserRound,
          },
          { href: '/plus/sources', label: 'Fil des sources (ce que l’IA a lu)', Icone: Inbox },
          { href: '/plus/synchros', label: 'État des synchros', Icone: RefreshCw },
        ].map(({ href, label, Icone }) => (
          <Link
            key={href}
            href={href}
            className="bloc bloc-presse flex items-center gap-3 bg-surface p-4 text-[17px] font-semibold"
          >
            <Icone size={22} aria-hidden />
            <span className="flex-1">{label}</span>
            <ChevronRight size={20} aria-hidden />
          </Link>
        ))}
      </nav>

      <form action={seDeconnecter} className="mb-12">
        <button type="submit" className="text-[16px] font-semibold text-corail underline">
          Se déconnecter
        </button>
      </form>

      <Marque />
    </div>
  );
}
