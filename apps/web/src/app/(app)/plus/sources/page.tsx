import Link from 'next/link';
import { formatTunis } from '@tandhim/core';
import { compterSourcesEnAttente, listerSourcesRecentes, tachesLieesASources } from '@tandhim/db';
import { Entete } from '@/components/entete';
import { LienRetour } from '@/components/retour';
import { getDb } from '@/lib/db';
import { LienSource } from '@/components/lien-source';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fil des sources' };

const ETATS: Record<string, { texte: string; classe: string }> = {
  a_traiter: { texte: 'En attente', classe: 'bg-jaune text-sur-couleur' },
  traite: { texte: 'Analysé', classe: 'bg-vert text-white' },
  ignore: { texte: 'Sans rapport', classe: 'border-ligne bg-papier text-gris' },
  erreur: { texte: 'Erreur', classe: 'bg-corail text-white' },
};

/** Journal de ce que le moteur IA a lu (mails, annonces) et de ce qu'il en a fait. */
export default function FilDesSources() {
  const { db } = getDb();
  const sources = listerSourcesRecentes(db, 80);
  const liens = tachesLieesASources(
    db,
    sources.map((x) => x.s.id),
  );
  const enAttente = compterSourcesEnAttente(db);

  return (
    <div className="max-w-2xl">
      <LienRetour href="/plus">Plus</LienRetour>
      <Entete
        contexte={enAttente ? `${enAttente} élément(s) en attente d’analyse` : 'Tout est analysé'}
        titre="Fil des sources"
      />
      {sources.length === 0 ? (
        <div className="rounded-[18px] border-2 border-dashed border-encre p-4 text-[15px]">
          <p className="font-semibold">Rien pour l’instant.</p>
          <p className="text-gris">
            Les mails de l’INSAT et les annonces Classroom apparaîtront ici dès la prochaine
            synchro.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {sources.map(({ s, matiere }) => {
            const taches = liens.filter((l) => l.sourceItemId === s.id);
            const etat = ETATS[s.status] ?? ETATS.a_traiter!;
            return (
              <li
                key={s.id}
                className={`bloc bg-surface p-3 ${s.status === 'ignore' ? 'opacity-60' : ''}`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className={`pastille ${etat.classe}`}>{etat.texte}</span>
                  <span className="pastille border-ligne bg-papier">
                    {s.source === 'gmail'
                      ? s.direction === 'envoye'
                        ? 'Mail envoyé'
                        : 'Mail'
                      : s.source === 'drive'
                        ? 'Drive'
                        : s.source === 'messenger'
                          ? 'Messenger'
                          : 'Classroom'}
                  </span>
                  {matiere?.code && (
                    <span
                      className="pastille text-sur-couleur"
                      style={{ background: matiere.color ?? undefined }}
                    >
                      {matiere.code}
                    </span>
                  )}
                  <span className="text-[13px] text-gris">
                    {formatTunis(new Date(s.sentAt), "d MMM 'à' HH:mm")}
                  </span>
                </div>
                <p className="text-[15px] font-semibold leading-snug">{s.title ?? 'Sans titre'}</p>
                {s.sender && <p className="break-all text-[13px] text-gris">{s.sender}</p>}
                {taches.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {taches.map((t) => (
                      <li key={t.itemId}>
                        <Link
                          href={`/taches/${t.itemId}?retour=/plus/sources`}
                          className="text-[14px] font-semibold underline"
                        >
                          {t.titre}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {s.error && s.status !== 'traite' && (
                  <p className="mt-1 text-[13px] text-corail">{s.error}</p>
                )}
                {s.link && (
                  <p className="mt-1 text-[13px]">
                    <LienSource
                      type={s.source}
                      href={s.link}
                      sourceId={s.id}
                      retour="/plus/sources"
                      className="underline"
                    />
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
