import { DELAIS_RAPPEL_HEURES, formatTunis, loadEnv } from '@tandhim/core';
import { delaiRappelHeures, listerAbonnements } from '@tandhim/db';
import { Entete, TitreSection } from '@/components/entete';
import { LienRetour } from '@/components/retour';
import { getDb } from '@/lib/db';
import { reglerDelai } from './actions';
import { NotificationsAppareil } from './appareil';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

const LIBELLES_DELAI: Record<number, string> = {
  24: '1 jour avant',
  48: '2 jours avant',
  72: '3 jours avant',
};

export default function Notifications() {
  const { db } = getDb();
  const clePublique = loadEnv().VAPID_PUBLIC_KEY;
  const appareils = listerAbonnements(db);
  const delai = delaiRappelHeures(db);

  return (
    <div className="max-w-xl">
      <LienRetour href="/plus">Plus</LienRetour>
      <Entete titre="Notifications" />
      <p className="mb-5 text-[16px] text-gris">
        Un rappel avant chaque échéance (tâches, devoirs, TP, validations). Jamais entre 22:00 et
        07:30 : un rappel qui tomberait la nuit part la veille à 21:00.
      </p>

      <section aria-labelledby="cet-appareil" className="mb-8">
        <TitreSection id="cet-appareil">Cet appareil</TitreSection>
        {clePublique ? (
          <NotificationsAppareil clePublique={clePublique} />
        ) : (
          <p role="alert" className="bloc bg-corail px-4 py-3 text-[15px] text-white">
            Les clés de notification (VAPID) manquent dans le .env du serveur.
          </p>
        )}
      </section>

      <section aria-labelledby="quand" className="mb-8">
        <TitreSection id="quand">Quand me prévenir</TitreSection>
        <form action={reglerDelai} className="flex flex-wrap gap-2.5">
          {DELAIS_RAPPEL_HEURES.map((h) => (
            <button
              key={h}
              type="submit"
              name="heures"
              value={h}
              aria-pressed={h === delai}
              className={`bloc bloc-presse min-h-11 px-4 py-2.5 text-[16px] font-bold ${h === delai ? 'bg-encre text-jaune' : 'bg-surface'}`}
            >
              {LIBELLES_DELAI[h]}
            </button>
          ))}
        </form>
      </section>

      <section aria-labelledby="appareils" className="mb-8">
        <TitreSection id="appareils">Appareils qui reçoivent les rappels</TitreSection>
        {appareils.length === 0 ? (
          <p className="rounded-[18px] border-2 border-dashed border-encre p-4 text-[15px]">
            Aucun appareil pour l’instant. Active les notifications ci-dessus, sur ton iPhone (app
            ouverte depuis l’écran d’accueil) et, si tu veux, sur ton PC.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {appareils.map((a) => (
              <li key={a.id} className="bloc bg-surface px-4 py-3 text-[15px]">
                <p className="font-bold">{a.appareil ?? 'Appareil'}</p>
                <p className="text-gris">
                  Ajouté le {formatTunis(new Date(a.createdAt), 'd MMM')}
                  {a.lastSuccessAt &&
                    `, dernier envoi réussi le ${formatTunis(new Date(a.lastSuccessAt), "d MMM 'à' HH:mm")}`}
                </p>
                {a.lastError && <p className="text-corail">Dernier échec : {a.lastError}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
