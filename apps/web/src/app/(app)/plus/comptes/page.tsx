import { listerComptes, listerCours, listerDossiersDrive } from '@tandhim/db';
import { Entete, TitreSection } from '@/components/entete';
import { LienRetour } from '@/components/retour';
import { getDb } from '@/lib/db';
import { chargerMatieres } from '@/lib/donnees';
import {
  oublierCompte,
  reglerCoursAction,
  retirerDossierDrive,
  suivreDossierDrive,
} from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Comptes et cours' };

const bouton = 'bloc bloc-presse inline-block px-4 py-2.5 text-[15px] font-bold';

export default async function Comptes({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const { ok, erreur } = await searchParams;
  const { db } = getDb();
  const comptes = listerComptes(db);
  const cours = listerCours(db);
  const dossiers = listerDossiersDrive(db);
  const matieres = [...chargerMatieres().values()];
  const libelles = new Set(comptes.map((c) => c.label));
  // Cours décochés par Fares : masqués (repliés en bas) ; nouveaux cours non tranchés : visibles.
  const visibles = cours.filter((e) => e.cours.followed || e.cours.suggested);
  const masques = cours.filter((e) => !e.cours.followed && !e.cours.suggested);

  return (
    <div className="max-w-2xl">
      <LienRetour href="/plus">Plus</LienRetour>
      <Entete titre="Comptes et cours" />

      {ok && (
        <p
          role="status"
          className="bloc mb-6 bg-vert px-4 py-3 text-[15px] font-semibold text-white"
        >
          {ok} est connecté. Les cours et devoirs arrivent dans quelques secondes.
        </p>
      )}
      {erreur && (
        <p
          role="alert"
          className="bloc mb-6 bg-corail px-4 py-3 text-[15px] font-semibold text-white"
        >
          {erreur}
        </p>
      )}

      <section aria-labelledby="comptes" className="mb-10">
        <TitreSection id="comptes">Comptes Google</TitreSection>
        <p className="mb-3 text-[15px] text-gris">
          Lecture seule : Tandhim ne modifie, n’envoie et ne rend jamais rien.
        </p>
        <ul className="mb-4 flex flex-col gap-2.5">
          {comptes.map((c) => (
            <li key={c.id} className="bloc flex flex-wrap items-center gap-3 bg-surface p-4">
              <span className="min-w-0 flex-1">
                <span className="block break-all text-[16px] font-semibold">{c.email}</span>
                <span className="text-[14px] text-gris">Compte {c.label}</span>
              </span>
              {c.status === 'ok' ? (
                <span className="pastille bg-vert text-white">Connecté</span>
              ) : (
                <a
                  href={`/api/google/connecter?compte=${c.label}`}
                  className={`${bouton} bg-corail text-white`}
                >
                  Reconnecter
                </a>
              )}
              <form action={oublierCompte}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" className="text-[14px] font-semibold text-gris underline">
                  Retirer
                </button>
              </form>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          {(['fac', 'perso'] as const)
            .filter((l) => !libelles.has(l))
            .map((l) => (
              <a
                key={l}
                href={`/api/google/connecter?compte=${l}`}
                className={`${bouton} bg-jaune text-sur-couleur`}
              >
                Connecter le compte {l}
              </a>
            ))}
        </div>
      </section>

      {visibles.length > 0 && (
        <section aria-labelledby="cours" className="mb-8">
          <TitreSection id="cours">Cours Classroom</TitreSection>
          <p className="mb-3 text-[15px] text-gris">
            Les devoirs des cours cochés arrivent dans « À faire ». Décoche un cours pour le masquer
            : ses devoirs et annonces disparaissent de l’app.
          </p>
          <ul className="flex flex-col gap-2.5">
            {visibles.map((e) => (
              <LigneCours key={e.cours.id} entree={e} matieres={matieres} />
            ))}
          </ul>
        </section>
      )}
      {masques.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[15px] font-semibold text-gris">
            Cours masqués ({masques.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-2.5">
            {masques.map((e) => (
              <LigneCours key={e.cours.id} entree={e} matieres={matieres} />
            ))}
          </ul>
        </details>
      )}

      <section aria-labelledby="drive" className="mb-8 mt-10">
        <TitreSection id="drive">Dossiers Drive suivis</TitreSection>
        <p className="mb-3 text-[15px] text-gris">
          Les fichiers apparaissent sur la page de la matière ; les nouveaux sont lus par l’IA
          (consignes, échéances). Lecture seule.
        </p>
        {dossiers.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2.5">
            {dossiers.map((d) => (
              <li key={d.id} className="bloc flex flex-wrap items-center gap-3 bg-surface p-4">
                <span className="min-w-0 flex-1">
                  <a
                    href={`https://drive.google.com/drive/folders/${d.folderId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block break-all text-[16px] font-semibold underline"
                  >
                    {d.nom ?? 'Dossier (première synchro en attente)'}
                  </a>
                  <span className="text-[14px] text-gris">
                    {d.nomMatiere ?? 'Aucune matière'}
                    {d.lastSeenAt ? '' : ', synchro dans quelques minutes'}
                  </span>
                </span>
                <form action={retirerDossierDrive}>
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" className="text-[14px] font-semibold text-gris underline">
                    Retirer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={suivreDossierDrive} className="bloc flex flex-col gap-2.5 bg-surface p-4">
          <label htmlFor="lienDrive" className="text-[14px] font-semibold">
            Lien du dossier
          </label>
          <input
            id="lienDrive"
            name="lien"
            required
            placeholder="https://drive.google.com/drive/folders/…"
            className="h-11 rounded-xl border-2 border-encre bg-papier px-3 text-[15px]"
          />
          <div className="flex gap-2">
            <select
              name="subjectId"
              aria-label="Matière du dossier"
              className="h-11 min-w-0 flex-1 rounded-xl border-2 border-encre bg-papier px-2 text-[15px]"
            >
              <option value="">Aucune matière</option>
              {matieres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button type="submit" className={`${bouton} bg-jaune text-sur-couleur`}>
              Suivre
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type EntreeCours = ReturnType<typeof listerCours>[number];

function LigneCours({
  entree: { cours: c, compte, matiere },
  matieres,
}: {
  entree: EntreeCours;
  matieres: { id: number; name: string }[];
}) {
  return (
    <li className={`bloc bg-surface p-3 ${c.followed ? '' : 'opacity-75'}`}>
      <form action={reglerCoursAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={c.id} />
        <div className="flex items-start gap-3">
          <input
            id={`suivre-${c.id}`}
            type="checkbox"
            name="followed"
            defaultChecked={c.followed}
            className="mt-1 h-6 w-6 shrink-0 accent-[#1e1b2e]"
          />
          <label htmlFor={`suivre-${c.id}`} className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold leading-snug">{c.name}</span>
            <span className="text-[13px] text-gris">
              Compte {compte.label}
              {c.suggested && matiere ? ', proposition à vérifier' : ''}
            </span>
          </label>
        </div>
        <div className="flex gap-2 pl-9">
          <select
            name="subjectId"
            defaultValue={matiere?.id ?? ''}
            aria-label={`Matière de ${c.name}`}
            className="h-10 min-w-0 flex-1 rounded-xl border-2 border-encre bg-papier px-2 text-[15px]"
          >
            <option value="">Aucune matière</option>
            {matieres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl border-2 border-encre bg-jaune px-3 text-[14px] font-bold text-sur-couleur"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </li>
  );
}
