import Link from 'next/link';
import {
  BookOpen,
  FileText,
  Inbox,
  type LucideIcon,
  Megaphone,
  Search,
  SquareCheck,
} from 'lucide-react';
import { formatTunis } from '@tandhim/core';
import { type ResultatRecherche, rechercher } from '@tandhim/db';
import { Entete, TitreSection } from '@/components/entete';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rechercher' };

const GROUPES: { type: ResultatRecherche['type']; titre: string; Icone: LucideIcon }[] = [
  { type: 'matiere', titre: 'Matières', Icone: BookOpen },
  { type: 'tache', titre: 'Tâches', Icone: SquareCheck },
  { type: 'message', titre: 'Messages', Icone: Inbox },
  { type: 'fichier', titre: 'Fichiers', Icone: FileText },
  { type: 'annonce', titre: 'Annonces Classroom', Icone: Megaphone },
];

function Resultat({ r, Icone }: { r: ResultatRecherche; Icone: LucideIcon }) {
  const interne = r.lien?.startsWith('/');
  const contenu = (
    <>
      <Icone size={20} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug">{r.titre}</span>
        {r.detail && <span className="line-clamp-2 block text-[13px] text-gris">{r.detail}</span>}
      </span>
      {r.date && (
        <span className="shrink-0 text-[13px] text-gris">
          {formatTunis(new Date(r.date), 'd MMM')}
        </span>
      )}
    </>
  );
  const classe = 'flex gap-3 border-b-2 border-dashed border-ligne py-2.5 last:border-b-0';
  if (!r.lien) return <li className={classe}>{contenu}</li>;
  return (
    <li>
      {interne ? (
        <Link href={r.lien} className={classe}>
          {contenu}
        </Link>
      ) : (
        <a href={r.lien} target="_blank" rel="noreferrer" className={classe}>
          {contenu}
        </a>
      )}
    </li>
  );
}

export default async function Recherche({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q ?? '').trim().slice(0, 100);
  const resultats = q ? rechercher(getDb().db, q) : [];

  return (
    <div className="max-w-2xl">
      <Entete titre="Rechercher" />
      <form role="search" action="/recherche" className="relative mb-6">
        <Search
          size={20}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris"
        />
        <input
          type="search"
          name="q"
          defaultValue={q}
          autoFocus
          enterKeyHint="search"
          aria-label="Rechercher dans les matières, tâches, messages et fichiers"
          placeholder="Matière, tâche, prof, fichier…"
          className="h-13 w-full rounded-xl border-2 border-encre bg-surface py-3 pl-10 pr-3 text-[17px] outline-none focus-visible:shadow-[3px_3px_0_var(--ombre)]"
        />
      </form>

      {!q ? (
        <p className="text-[15px] text-gris">
          Cherche dans les matières, les tâches, les mails et annonces lus par l’IA, et les fichiers
          reçus. Sur PC : Ctrl+K depuis n’importe quelle page.
        </p>
      ) : resultats.length === 0 ? (
        <div className="rounded-[18px] border-2 border-dashed border-encre p-4 text-[15px]">
          <p className="font-semibold">Rien trouvé pour « {q} ».</p>
          <p className="text-gris">Essaie un autre mot, ou le nom de la matière ou du prof.</p>
        </div>
      ) : (
        GROUPES.map(({ type, titre, Icone }) => {
          const liste = resultats.filter((r) => r.type === type);
          if (!liste.length) return null;
          return (
            <section key={type} aria-labelledby={`r-${type}`} className="mb-6">
              <TitreSection id={`r-${type}`}>{titre}</TitreSection>
              <ul className="bloc bg-surface px-4 py-1">
                {liste.map((r, i) => (
                  <Resultat key={`${type}-${i}`} r={r} Icone={Icone} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
