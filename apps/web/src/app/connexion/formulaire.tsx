'use client';

import { useActionState } from 'react';
import { type EtatConnexion, seConnecter } from './actions';

export function FormulaireConnexion({ suite }: { suite?: string }) {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(seConnecter, {});
  return (
    <form action={action} className="bloc flex flex-col gap-3 bg-surface p-5">
      <input type="hidden" name="suite" value={suite ?? '/'} />
      <label htmlFor="motDePasse" className="text-[15px] font-semibold">
        Mot de passe
      </label>
      <input
        id="motDePasse"
        name="motDePasse"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        aria-invalid={Boolean(etat.erreur)}
        aria-describedby={etat.erreur ? 'erreur-connexion' : undefined}
        className="h-12 rounded-xl border-2 border-encre bg-papier px-4 text-[17px] text-encre outline-none focus-visible:shadow-[3px_3px_0_var(--ombre)]"
      />
      {etat.erreur && (
        <p id="erreur-connexion" role="alert" className="text-[15px] font-semibold text-corail">
          {etat.erreur}
        </p>
      )}
      <button
        type="submit"
        disabled={enCours}
        className="bloc bloc-presse mt-2 h-12 bg-jaune text-[17px] font-bold text-sur-couleur disabled:opacity-60"
      >
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
