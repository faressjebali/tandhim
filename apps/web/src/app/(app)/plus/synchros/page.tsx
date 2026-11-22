import Link from 'next/link';
import { formatTunis } from '@tandhim/core';
import { listerComptes, listerEtatsSync } from '@tandhim/db';
import { Entete } from '@/components/entete';
import { Rafraichir } from '@/components/rafraichir';
import { LienRetour } from '@/components/retour';
import { getDb } from '@/lib/db';
import { synchroniserMaintenant } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'État des synchros' };

const quand = (iso: string | null) =>
  iso ? formatTunis(new Date(iso), "d MMM 'à' HH:mm") : 'jamais';

export default function Synchros() {
  const { db } = getDb();
  const etats = listerEtatsSync(db);
  const aReconnecter = listerComptes(db).filter((c) => c.status === 'a_reconnecter');

  return (
    <div className="max-w-2xl">
      <Rafraichir toutesLesSecondes={15} />
      <LienRetour href="/plus">Plus</LienRetour>
      <Entete titre="État des synchros" />

      {aReconnecter.map((c) => (
        <p key={c.id} role="alert" className="bloc mb-4 bg-corail px-4 py-3 text-[15px] text-white">
          <span className="font-bold">{c.email}</span> n’est plus autorisé (mot de passe changé ou
          accès retiré).{' '}
          <Link href="/plus/comptes" className="font-bold underline">
            Reconnecter
          </Link>
        </p>
      ))}

      {etats.length === 0 ? (
        <div className="rounded-[18px] border-2 border-dashed border-encre p-4 text-[15px]">
          <p className="font-semibold">Aucune synchro pour l’instant.</p>
          <p className="text-gris">
            Connecte un compte Google dans{' '}
            <Link href="/plus/comptes" className="underline">
              Comptes et cours
            </Link>{' '}
            : Classroom sera lu toutes les 15 minutes.
          </p>
        </div>
      ) : (
        <ul className="mb-6 flex flex-col gap-2.5">
          {etats.map((s) => {
            const enErreur = s.consecutiveFailures > 0;
            return (
              <li key={s.key} className="bloc bg-surface p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="break-all text-[16px] font-semibold">{s.label}</span>
                  <span
                    className={`pastille ${enErreur ? 'bg-corail text-white' : 'bg-vert text-white'}`}
                  >
                    {enErreur ? 'En erreur' : 'OK'}
                  </span>
                </div>
                <p className="text-[14px] text-gris">Dernier succès : {quand(s.lastSuccessAt)}</p>
                {s.details && !enErreur && <p className="text-[14px]">{s.details}</p>}
                {enErreur && (
                  <p className="mt-1 text-[14px]">
                    {s.consecutiveFailures} échec(s) de suite : {s.lastError}
                    <br />
                    <span className="text-gris">
                      Nouvel essai automatique {quand(s.nextRetryAt)}.
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form action={synchroniserMaintenant}>
        <button
          type="submit"
          className="bloc bloc-presse bg-jaune px-4 py-2.5 text-[15px] font-bold text-sur-couleur"
        >
          Synchroniser maintenant
        </button>
      </form>
    </div>
  );
}
