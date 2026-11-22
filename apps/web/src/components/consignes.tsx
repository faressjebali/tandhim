import { formatTunis } from '@tandhim/core';
import type { ConsigneVue } from '@tandhim/db';
import { appliquerDateAction } from '@/app/(app)/actions';
import { MarquerVu } from './marquer-vu';
import { LienSource } from './lien-source';
import { TexteAvecLiens } from './texte-avec-liens';

const NIVEAUX: Record<string, string> = {
  fares: 'Ta version',
  ecrit: 'Écrit',
  messenger: 'Messenger',
};

function origine(c: ConsigneVue): string {
  if (c.niveau === 'fares') return NIVEAUX.fares!;
  if (!c.source) return NIVEAUX[c.niveau] ?? '';
  if (c.source.type === 'gmail') return 'Mail';
  if (c.source.type === 'classroom') return 'Classroom';
  if (c.source.type === 'drive') return 'Drive';
  return 'Messenger';
}

/**
 * Consignes d'une tâche, dans l'ordre : chacune avec sa date et sa source. Une consigne remplacée
 * par une info au moins aussi fiable est barrée ; une info moins fiable qui la contredit est
 * affichée à côté, « à vérifier ». Une date proposée peut être appliquée d'un geste.
 */
export function ConsignesTache({
  itemId,
  consignes,
}: {
  itemId: number;
  consignes: ConsigneVue[];
}) {
  if (!consignes.length) return null;
  const nonVues = consignes.some((c) => !c.vue);
  return (
    <div className="mt-3">
      {nonVues && <MarquerVu itemId={itemId} />}
      <p className="mb-1.5 text-[14px] font-semibold">Consignes reçues</p>
      <ol className="flex flex-col gap-2">
        {consignes.map((c) => (
          <li
            key={c.id}
            className={`rounded-xl border-2 px-3 py-2 text-[15px] ${
              c.aVerifier ? 'border-jaune bg-jaune/15' : 'border-ligne'
            } ${!c.vue ? 'border-violet' : ''}`}
          >
            <p className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-gris">
              <span>{formatTunis(new Date(c.dateInfo), "d MMM 'à' HH:mm")}</span>
              <span>· {origine(c)}</span>
              {!c.vue && <span className="pastille bg-violet text-white">Nouvelle</span>}
              {c.aVerifier && (
                <span className="pastille bg-jaune text-sur-couleur">À vérifier</span>
              )}
              {c.remplacee && <span>· remplacée</span>}
            </p>
            <p className={c.remplacee ? 'text-gris line-through' : ''}>
              <TexteAvecLiens texte={c.texte} />
            </p>
            {c.echeanceProposee && (
              <form
                action={appliquerDateAction}
                className="mt-1.5 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="consigne" value={c.id} />
                <span className="text-[14px]">
                  Date proposée :{' '}
                  <span className="font-semibold">
                    {formatTunis(new Date(c.echeanceProposee), "EEEE d MMMM 'à' HH:mm")}
                  </span>
                </span>
                <button
                  type="submit"
                  className="min-h-9 rounded-lg border-2 border-encre bg-jaune px-3 text-[14px] font-bold text-sur-couleur"
                >
                  Appliquer cette date
                </button>
              </form>
            )}
            {c.source?.lien && (
              <p className="mt-1 text-[13px]">
                <LienSource
                  type={c.source.type}
                  href={c.source.lien}
                  sourceId={c.sourceItemId}
                  retour={`/taches/${itemId}`}
                />
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
