import { notFound, redirect } from 'next/navigation';
import { FileText, Paperclip } from 'lucide-react';
import { formatTunis } from '@tandhim/core';
import { trouverSource } from '@tandhim/db';
import { Entete } from '@/components/entete';
import { LienRetour } from '@/components/retour';
import { TexteAvecLiens } from '@/components/texte-avec-liens';
import { getDb } from '@/lib/db';
import { retourSur } from '@/lib/donnees';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Message' };

/**
 * Lecture d'un mail dans l'app (l'app Gmail de l'iPhone n'accepte pas les liens vers un mail
 * précis). Pièces jointes relayées depuis Gmail. Classroom, Messenger et Drive s'ouvrent dans
 * leur app d'origine (décision de Fares, 21/11/2026).
 */
export default async function PageSource({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retour?: string }>;
}) {
  const s = trouverSource(getDb().db, Number((await params).id));
  if (!s) notFound();
  if (s.source !== 'gmail') redirect(s.link ?? '/plus/sources');
  const retour = retourSur((await searchParams).retour, '/plus/sources');
  const pieces = s.attachments.filter((p) => !['lien', 'video', 'formulaire'].includes(p.type));

  return (
    <div className="max-w-2xl">
      <LienRetour href={retour} />
      <Entete
        contexte={formatTunis(new Date(s.sentAt), "EEEE d MMMM yyyy 'à' HH:mm")}
        titre={s.title || 'Sans objet'}
        compact
      />
      <div className="bloc mb-4 bg-surface p-4 text-[14px]">
        {s.sender && (
          <p className="break-words">
            <span className="text-gris">De : </span>
            <span className="font-semibold">{s.sender}</span>
          </p>
        )}
        {s.recipients && (
          <p className="break-words">
            <span className="text-gris">À : </span>
            {s.recipients}
          </p>
        )}
      </div>

      {pieces.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {pieces.map((p, i) => {
            const lien = p.id ? `/api/sources/${s.id}/pieces/${s.attachments.indexOf(p)}` : null;
            return (
              <li key={i}>
                {lien ? (
                  <a
                    href={lien}
                    target="_blank"
                    rel="noreferrer"
                    className="bloc bloc-presse flex min-h-12 items-center gap-3 bg-surface px-4 py-3 text-[15px] font-semibold"
                  >
                    <Paperclip size={18} aria-hidden className="shrink-0" />
                    <span className="min-w-0 break-words">{p.nom}</span>
                  </a>
                ) : (
                  <span className="flex items-center gap-3 rounded-xl border-2 border-dashed border-ligne px-4 py-3 text-[15px]">
                    <FileText size={18} aria-hidden className="shrink-0" />
                    {p.nom}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <article className="bloc mb-6 whitespace-pre-wrap break-words bg-surface p-4 text-[16px] leading-relaxed">
        {s.body ? (
          <TexteAvecLiens texte={s.body} />
        ) : (
          <span className="text-gris">Message sans texte.</span>
        )}
      </article>
      <p className="mb-2 text-[13px] text-gris">
        Texte du mail sans l’historique cité. Pour répondre, ouvre-le dans Gmail.
      </p>
      {s.link && (
        <a
          href={s.link}
          target="_blank"
          rel="noreferrer"
          className="text-[15px] font-semibold underline"
        >
          Ouvrir dans Gmail
        </a>
      )}
    </div>
  );
}
