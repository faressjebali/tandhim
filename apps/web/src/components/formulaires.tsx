'use client';

import { useActionState, useRef, useState } from 'react';
import { type MatiereSaisie, analyserSaisie, formatDayKey, tunisDayKey } from '@tandhim/core';
import { type EtatFormulaire, enregistrerProjet, enregistrerTache } from '@/app/(app)/actions';

export interface Option {
  id: number;
  libelle: string;
}

const champ =
  'h-12 w-full rounded-xl border-2 border-encre bg-surface px-3 text-[16px] text-encre outline-none focus-visible:shadow-[3px_3px_0_var(--ombre)]';
const etiquette = 'mb-1.5 block text-[14px] font-semibold';

function Erreur({ etat }: { etat: EtatFormulaire }) {
  return etat.erreur ? (
    <p role="alert" className="bloc bg-corail px-3 py-2 text-[15px] font-semibold text-white">
      {etat.erreur}
    </p>
  ) : null;
}

function Enregistrer({ enCours, libelle }: { enCours: boolean; libelle: string }) {
  return (
    <button
      type="submit"
      disabled={enCours}
      className="bloc bloc-presse h-13 w-full bg-jaune py-3 text-[17px] font-bold text-sur-couleur disabled:opacity-60"
    >
      {enCours ? 'Enregistrement…' : libelle}
    </button>
  );
}

function ChoixImportance({ defaut, surChoix }: { defaut: string; surChoix?: () => void }) {
  const options = [
    { v: 'basse', l: 'Basse' },
    { v: 'normale', l: 'Normale' },
    { v: 'haute', l: 'Haute' },
  ];
  return (
    <fieldset>
      <legend className={etiquette}>Importance</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <label key={o.v} className="cursor-pointer">
            <input
              type="radio"
              name="importance"
              value={o.v}
              defaultChecked={defaut === o.v}
              onChange={surChoix}
              className="peer sr-only"
            />
            <span className="flex h-11 items-center justify-center rounded-xl border-2 border-encre bg-surface text-[14px] font-semibold peer-checked:bg-encre peer-checked:text-papier peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-bleu">
              {o.l}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Tâche ordinaire, ou épreuve (DS, examen) : les épreuves déclenchent le planning de révision. */
function ChoixType({ defaut }: { defaut: string }) {
  const options = [
    { v: 'tache', l: 'Tâche' },
    { v: 'ds', l: 'DS' },
    { v: 'examen', l: 'Examen' },
  ];
  return (
    <fieldset>
      <legend className={etiquette}>
        Type <span className="font-normal text-gris">(DS et examens : révisions planifiées)</span>
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <label key={o.v} className="cursor-pointer">
            <input
              type="radio"
              name="type"
              value={o.v}
              defaultChecked={defaut === o.v}
              className="peer sr-only"
            />
            <span className="flex h-11 items-center justify-center rounded-xl border-2 border-encre bg-surface text-[14px] font-semibold peer-checked:bg-encre peer-checked:text-papier peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-bleu">
              {o.l}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface ValeursTache {
  id?: number;
  titre?: string;
  description?: string | null;
  echeanceJour?: string;
  echeanceHeure?: string;
  importance?: string;
  matiereId?: number | null;
  projetId?: number | null;
  type?: 'tache' | 'ds' | 'examen';
}

export function FormulaireTache({
  valeurs = {},
  matieres,
  projets,
  matieresSaisie,
  retour,
}: {
  valeurs?: ValeursTache;
  matieres: Option[];
  projets: Option[];
  /** Fourni pour une NOUVELLE tâche : active l'ajout rapide en langage naturel. */
  matieresSaisie?: MatiereSaisie[];
  retour: string;
}) {
  const [etat, action, enCours] = useActionState(enregistrerTache, {});
  const formulaire = useRef<HTMLFormElement>(null);
  /** Champs modifiés à la main : l'ajout rapide ne les touche plus. */
  const touches = useRef(new Set<string>());
  const [compris, setCompris] = useState<string | null>(null);

  const analyser = (texte: string) => {
    if (!matieresSaisie || !formulaire.current) return;
    const r = analyserSaisie(texte, tunisDayKey(new Date()), matieresSaisie);
    const champs = formulaire.current.elements;
    const remplir = (nom: string, valeur: string) => {
      const el = champs.namedItem(nom) as HTMLInputElement | HTMLSelectElement | null;
      if (el && !touches.current.has(nom)) el.value = valeur;
    };
    remplir('echeanceJour', r.jour ?? valeurs.echeanceJour ?? '');
    remplir('echeanceHeure', r.heure ?? '');
    remplir('matiereId', r.matiereId ? String(r.matiereId) : '');
    if (!touches.current.has('importance')) {
      const radio = formulaire.current.querySelector<HTMLInputElement>(
        `input[name="importance"][value="${r.importance ?? 'normale'}"]`,
      );
      if (radio) radio.checked = true;
    }
    const morceaux = [
      r.matiereId && matieresSaisie.find((m) => m.id === r.matiereId)?.nom,
      r.jour && formatDayKey(r.jour, 'EEEE d MMMM'),
      r.heure && `à ${r.heure}`,
      r.importance && 'importance haute',
    ].filter(Boolean);
    setCompris(morceaux.length ? morceaux.join(', ') : null);
  };
  const toucher = (nom: string) => () => touches.current.add(nom);

  return (
    <form ref={formulaire} action={action} className="flex flex-col gap-5">
      {valeurs.id && <input type="hidden" name="id" value={valeurs.id} />}
      <input type="hidden" name="retour" value={retour} />
      <div>
        <label htmlFor="titre" className={etiquette}>
          Tâche
        </label>
        <input
          id="titre"
          name="titre"
          required
          autoFocus={!valeurs.id}
          defaultValue={valeurs.titre}
          placeholder={matieresSaisie ? 'Ex. TP ML vendredi 14h' : 'Ex. compte rendu du TP de TNS'}
          onChange={matieresSaisie ? (e) => analyser(e.target.value) : undefined}
          aria-describedby={matieresSaisie ? 'compris' : undefined}
          className={champ}
        />
        {matieresSaisie && (
          <p id="compris" aria-live="polite" className="mt-1.5 text-[14px] text-gris">
            {compris ? (
              <>
                Compris : <span className="font-semibold text-encre">{compris}</span>
              </>
            ) : (
              'Tape la matière, le jour et l’heure : les champs se remplissent tout seuls.'
            )}
          </p>
        )}
      </div>
      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <div>
          <label htmlFor="echeanceJour" className={etiquette}>
            Pour le
          </label>
          <input
            id="echeanceJour"
            name="echeanceJour"
            type="date"
            defaultValue={valeurs.echeanceJour}
            onChange={toucher('echeanceJour')}
            className={champ}
          />
        </div>
        <div>
          <label htmlFor="echeanceHeure" className={etiquette}>
            Heure <span className="font-normal text-gris">(facultatif)</span>
          </label>
          <input
            id="echeanceHeure"
            name="echeanceHeure"
            type="time"
            defaultValue={valeurs.echeanceHeure}
            onChange={toucher('echeanceHeure')}
            className={champ}
          />
        </div>
      </div>
      <ChoixImportance defaut={valeurs.importance ?? 'normale'} surChoix={toucher('importance')} />
      <ChoixType defaut={valeurs.type ?? 'tache'} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="matiereId" className={etiquette}>
            Matière
          </label>
          <select
            id="matiereId"
            name="matiereId"
            defaultValue={valeurs.matiereId ?? ''}
            onChange={toucher('matiereId')}
            className={champ}
          >
            <option value="">Aucune</option>
            {matieres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="projetId" className={etiquette}>
            Projet
          </label>
          <select
            id="projetId"
            name="projetId"
            defaultValue={valeurs.projetId ?? ''}
            className={champ}
          >
            <option value="">Aucun</option>
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.libelle}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="description" className={etiquette}>
          Notes
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={valeurs.description ?? ''}
          className={`${champ} h-auto py-2`}
        />
      </div>
      <Erreur etat={etat} />
      <Enregistrer enCours={enCours} libelle={valeurs.id ? 'Enregistrer' : 'Ajouter la tâche'} />
    </form>
  );
}

export const COULEURS_PROJET = ['#ffc567', '#fb7da8', '#ff8a75', '#9d85f2', '#4cc38a', '#5db7f0'];

export interface ValeursProjet {
  id?: number;
  titre?: string;
  type?: 'cours' | 'perso';
  matiereId?: number | null;
  description?: string | null;
  echeance?: string | null;
  couleur?: string | null;
}

export function FormulaireProjet({
  valeurs = {},
  matieres,
}: {
  valeurs?: ValeursProjet;
  matieres: Option[];
}) {
  const [etat, action, enCours] = useActionState(enregistrerProjet, {});
  const [type, setType] = useState<'cours' | 'perso'>(valeurs.type ?? 'perso');
  return (
    <form action={action} className="flex flex-col gap-5">
      {valeurs.id && <input type="hidden" name="id" value={valeurs.id} />}
      <div>
        <label htmlFor="titre" className={etiquette}>
          Nom du projet
        </label>
        <input
          id="titre"
          name="titre"
          required
          autoFocus={!valeurs.id}
          defaultValue={valeurs.titre}
          placeholder="Ex. projet Frameworks, portfolio…"
          className={champ}
        />
      </div>
      <fieldset>
        <legend className={etiquette}>Type</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['perso', 'cours'] as const).map((t) => (
            <label key={t} className="cursor-pointer">
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                className="peer sr-only"
              />
              <span className="flex h-11 items-center justify-center rounded-xl border-2 border-encre bg-surface text-[15px] font-semibold peer-checked:bg-encre peer-checked:text-papier peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-bleu">
                {t === 'perso' ? 'Personnel' : 'Projet de cours'}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {type === 'cours' ? (
        <div>
          <label htmlFor="matiereId" className={etiquette}>
            Matière
          </label>
          <select
            id="matiereId"
            name="matiereId"
            required
            defaultValue={valeurs.matiereId ?? ''}
            className={champ}
          >
            <option value="" disabled>
              Choisir…
            </option>
            {matieres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.libelle}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <fieldset>
          <legend className={etiquette}>Couleur</legend>
          <div className="flex gap-3">
            {COULEURS_PROJET.map((c, i) => (
              <label key={c} className="cursor-pointer">
                <input
                  type="radio"
                  name="couleur"
                  value={c}
                  defaultChecked={(valeurs.couleur ?? COULEURS_PROJET[0]) === c}
                  aria-label={`Couleur ${i + 1}`}
                  className="peer sr-only"
                />
                <span
                  className="block h-10 w-10 rounded-full border-2 border-encre peer-checked:shadow-[0_0_0_3px_var(--papier),0_0_0_5px_var(--encre)]"
                  style={{ background: c }}
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div>
        <label htmlFor="echeance" className={etiquette}>
          Échéance <span className="font-normal text-gris">(facultatif)</span>
        </label>
        <input
          id="echeance"
          name="echeance"
          type="date"
          defaultValue={valeurs.echeance ?? ''}
          className={champ}
        />
      </div>
      <div>
        <label htmlFor="description" className={etiquette}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={valeurs.description ?? ''}
          className={`${champ} h-auto py-2`}
        />
      </div>
      <Erreur etat={etat} />
      <Enregistrer enCours={enCours} libelle={valeurs.id ? 'Enregistrer' : 'Créer le projet'} />
    </form>
  );
}
