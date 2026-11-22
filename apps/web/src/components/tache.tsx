'use client';

import Link from 'next/link';
import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { CalendarClock, Check, ExternalLink, Flag, Pencil, Trash2, Undo2 } from 'lucide-react';
import type { Urgence } from '@tandhim/core';
import {
  annulerReport,
  basculerTache,
  reporterTacheAction,
  supprimerTacheAction,
} from '@/app/(app)/actions';
import { proposerAnnulation } from './annulation';

export interface TacheVue {
  id: number;
  titre: string;
  faite: boolean;
  importance: 'basse' | 'normale' | 'haute';
  echeance: { texte: string; urgence: Urgence };
  matiere: { code: string; couleur: string } | null;
  projet: string | null;
  aVerifier: boolean;
  source: string;
  lienSource: string | null;
  groupe: 'RT4' | 'RT4/1' | 'RT4/2';
  nouvelleInfo: boolean;
}

const STYLE_ECHEANCE: Record<Urgence, string> = {
  retard: 'bg-corail text-white border-encre',
  proche: 'bg-jaune text-sur-couleur border-encre',
  semaine: 'bg-surface text-encre border-encre',
  loin: 'border-transparent px-0 text-gris',
  aucune: 'border-transparent px-0 text-gris',
};

/** Distance (px) à partir de laquelle un glissement déclenche l'action. */
const SEUIL = 90;
const OPTION_MENU =
  'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[16px] font-semibold hover:bg-papier focus-visible:bg-papier';
/** Appui long (ms) qui ouvre le menu rapide. */
const APPUI_LONG_MS = 500;

/**
 * Ligne de tâche. Cocher en un toucher (affichage immédiat) ; glisser vers la droite = terminé,
 * vers la gauche = reporter d’un jour ; « Annuler » pendant 5 s ; toucher le titre pour modifier ;
 * appui long (clic droit sur PC) = menu rapide (modifier, source, reporter, supprimer).
 */
export function LigneTache({
  tache,
  retour,
  masquerProjet = false,
}: {
  tache: TacheVue;
  retour: string;
  /** Dans la page d'un projet, inutile de répéter son nom. */
  masquerProjet?: boolean;
}) {
  const [faite, marquer] = useOptimistic(tache.faite);
  const [, demarrer] = useTransition();
  const [decalage, setDecalage] = useState(0);
  const depart = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const aGlisse = useRef(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menu, setMenuEtat] = useState(false);
  /** Le doigt qui a ouvert le menu se relève juste après : ce clic-là ne doit pas le refermer. */
  const ouvertA = useRef(0);
  const setMenu = (v: boolean) => {
    if (v) ouvertA.current = Date.now();
    setMenuEtat(v);
  };
  const [confirmer, setConfirmer] = useState(false);
  const fermer = () => {
    setMenu(false);
    setConfirmer(false);
  };
  useEffect(() => {
    if (!menu) return;
    const surTouche = (e: KeyboardEvent) => e.key === 'Escape' && fermer();
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [menu]);
  const arreterMinuteur = () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
  };

  const changerFaite = (valeur: boolean, proposerAnnuler: boolean) =>
    demarrer(async () => {
      marquer(valeur);
      await basculerTache(tache.id, valeur);
      if (proposerAnnuler && valeur) {
        proposerAnnulation(
          `« ${tache.titre} » terminée`,
          () => void basculerTache(tache.id, false),
        );
      }
    });

  const reporter = () =>
    demarrer(async () => {
      const avant = await reporterTacheAction(tache.id);
      if (!avant) return;
      proposerAnnulation(
        `« ${tache.titre} » reportée d’un jour`,
        () => void annulerReport(tache.id, avant),
      );
    });

  // --- Glissement (doigt ou stylet ; la souris garde le clic) ----------------------------
  const debut = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    depart.current = { x: e.clientX, y: e.clientY, horizontal: null };
    aGlisse.current = false;
    arreterMinuteur();
    minuteur.current = setTimeout(() => {
      // Appui long sans bouger : menu rapide (et le relâchement n'ouvre pas la tâche).
      depart.current = null;
      aGlisse.current = true;
      setMenu(true);
    }, APPUI_LONG_MS);
  };
  const mouvement = (e: React.PointerEvent) => {
    const d = depart.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 10) arreterMinuteur();
    if (d.horizontal === null && Math.hypot(dx, dy) > 10)
      d.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!d.horizontal) return;
    aGlisse.current = true;
    // Rien à « terminer » si c'est déjà fait : seul le report reste possible.
    setDecalage(Math.max(-140, Math.min(faite ? 0 : 140, dx)));
  };
  const fin = () => {
    arreterMinuteur();
    const d = depart.current;
    depart.current = null;
    if (!d?.horizontal) return setDecalage(0);
    if (decalage >= SEUIL && !faite) changerFaite(true, true);
    else if (decalage <= -SEUIL) reporter();
    setDecalage(0);
  };

  return (
    <li className="bloc relative overflow-hidden bg-surface">
      {/* Fonds révélés par le glissement */}
      {decalage !== 0 && (
        <div
          aria-hidden
          className={`absolute inset-0 flex items-center px-4 text-[15px] font-bold ${
            decalage > 0
              ? 'justify-start bg-vert text-white'
              : 'justify-end bg-jaune text-sur-couleur'
          }`}
        >
          {decalage > 0 ? (
            <span className="flex items-center gap-2">
              <Check size={20} strokeWidth={3} /> Terminé
            </span>
          ) : (
            <span className="flex items-center gap-2">
              +1 jour <CalendarClock size={20} strokeWidth={2.6} />
            </span>
          )}
        </div>
      )}

      <div
        onPointerDown={debut}
        onPointerMove={mouvement}
        onPointerUp={fin}
        onPointerCancel={fin}
        onContextMenu={(e) => {
          e.preventDefault();
          arreterMinuteur();
          setMenu(true);
        }}
        onClickCapture={(e) => {
          // Un glissement n'ouvre pas la tâche.
          if (aGlisse.current) {
            e.preventDefault();
            e.stopPropagation();
            aGlisse.current = false;
          }
        }}
        style={{
          transform: decalage ? `translateX(${decalage}px)` : undefined,
          touchAction: 'pan-y',
          WebkitTouchCallout: 'none',
          userSelect: 'none',
        }}
        className={`relative flex items-start gap-3 bg-surface p-3 ${
          decalage ? '' : 'transition-transform motion-reduce:transition-none'
        } ${faite ? 'opacity-55' : ''}`}
      >
        <button
          type="button"
          onClick={() => changerFaite(!faite, false)}
          aria-pressed={faite}
          aria-label={
            faite
              ? `Marquer « ${tache.titre} » comme à faire`
              : `Marquer « ${tache.titre} » comme faite`
          }
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-encre transition-colors before:absolute before:-inset-2 before:content-[''] relative ${
            faite ? 'bg-vert text-white' : 'bg-papier'
          }`}
        >
          {faite && <Check size={18} strokeWidth={3} aria-hidden />}
        </button>
        <Link
          href={`/taches/${tache.id}?retour=${encodeURIComponent(retour)}`}
          draggable={false}
          className="min-w-0 flex-1"
        >
          <span
            className={`block text-[16px] font-semibold leading-snug ${faite ? 'line-through' : ''}`}
          >
            {tache.importance === 'haute' && (
              <Flag
                aria-label="Importante"
                size={15}
                strokeWidth={2.6}
                className="mr-1 inline -translate-y-px text-corail"
              />
            )}
            {tache.titre}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`pastille ${STYLE_ECHEANCE[tache.echeance.urgence]}`}>
              {tache.echeance.texte}
            </span>
            {tache.matiere && (
              <span
                className="pastille text-sur-couleur"
                style={{ background: tache.matiere.couleur }}
              >
                {tache.matiere.code}
              </span>
            )}
            {tache.projet && !masquerProjet && (
              <span className="pastille border-ligne bg-papier">{tache.projet}</span>
            )}
            {tache.nouvelleInfo && (
              <span className="pastille bg-violet text-white">Nouvelle info</span>
            )}
            {tache.groupe !== 'RT4' && (
              <span className="pastille border-ligne bg-papier">{tache.groupe}</span>
            )}
            {tache.source === 'classroom' && (
              <span className="pastille border-ligne bg-papier text-gris">Classroom</span>
            )}
            {tache.aVerifier && (
              <span className="pastille bg-jaune text-sur-couleur">À vérifier</span>
            )}
          </span>
        </Link>
      </div>
      {menu && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-encre/40 p-3 lg:items-center">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => Date.now() - ouvertA.current > 600 && fermer()}
            className="absolute inset-0"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`menu-${tache.id}`}
            className="bloc relative w-full max-w-md bg-surface p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
          >
            <p id={`menu-${tache.id}`} className="truncate px-3 pb-2 pt-1.5 text-[15px] font-bold">
              {tache.titre}
            </p>
            <div className="flex flex-col">
              <Link
                href={`/taches/${tache.id}?retour=${encodeURIComponent(retour)}`}
                autoFocus
                className={OPTION_MENU}
              >
                <Pencil size={20} aria-hidden /> Corriger ou modifier
              </Link>
              {tache.lienSource && (
                <a
                  href={tache.lienSource}
                  target="_blank"
                  rel="noreferrer"
                  className={OPTION_MENU}
                  onClick={fermer}
                >
                  <ExternalLink size={20} aria-hidden /> Voir la source
                </a>
              )}
              <button
                type="button"
                className={OPTION_MENU}
                onClick={() => {
                  fermer();
                  if (faite) changerFaite(false, false);
                  else changerFaite(true, true);
                }}
              >
                {faite ? <Undo2 size={20} aria-hidden /> : <Check size={20} aria-hidden />}
                {faite ? 'Remettre à faire' : 'Marquer comme faite'}
              </button>
              <button
                type="button"
                className={OPTION_MENU}
                onClick={() => {
                  fermer();
                  reporter();
                }}
              >
                <CalendarClock size={20} aria-hidden /> Reporter d’un jour
              </button>
              {confirmer ? (
                <button
                  type="button"
                  className={`${OPTION_MENU} bg-corail text-white`}
                  onClick={() => {
                    fermer();
                    demarrer(() => supprimerTacheAction(tache.id));
                  }}
                >
                  <Trash2 size={20} aria-hidden /> Confirmer la suppression
                </button>
              ) : (
                <button
                  type="button"
                  className={`${OPTION_MENU} text-corail`}
                  onClick={() => setConfirmer(true)}
                >
                  <Trash2 size={20} aria-hidden /> Supprimer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
