import { notFound } from 'next/navigation';
import {
  SESSION_TYPE_LABELS,
  addDaysToKey,
  dayKeysBetween,
  formatDayKey,
  formatTunis,
  seanceSupprimee,
  seancesDuJour,
  tunisDayKey,
} from '@tandhim/core';
import { ficheMatiere } from '@tandhim/db';
import { DetailsChangement } from '@/components/changement';
import { Entete, TitreSection } from '@/components/entete';
import { LienRetour } from '@/components/retour';
import { LigneTache } from '@/components/tache';
import { getDb } from '@/lib/db';
import {
  chargerCalendrier,
  chargerChangements,
  chargerMatieres,
  chargerTachesTriees,
  versVue,
} from '@/lib/donnees';
import { LienSource } from '@/components/lien-source';
import { TexteAvecLiens } from '@/components/texte-avec-liens';
import { maintenant as maintenantApp } from '@/lib/apercu';

export const dynamic = 'force-dynamic';

const HORIZON_JOURS = 14;
const vide = 'rounded-[18px] border-2 border-dashed border-encre p-4 text-[15px]';
const date = (iso: string) => formatTunis(new Date(iso), 'd MMM');

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: chargerMatieres().get(decodeURIComponent(code))?.name ?? 'Matière' };
}

export default async function PageMatiere({ params }: { params: Promise<{ code: string }> }) {
  const { code: brut } = await params;
  const code = decodeURIComponent(brut);
  const m = chargerMatieres().get(code);
  if (!m) notFound();

  const maintenant = maintenantApp();
  const aujourdhui = tunisDayKey(maintenant);
  const fin = addDaysToKey(aujourdhui, HORIZON_JOURS);
  const data = chargerCalendrier();
  const changements = chargerChangements(aujourdhui, fin);
  const seances = dayKeysBetween(aujourdhui, fin)
    .flatMap((j) => seancesDuJour(j, data, changements))
    .filter((s) => s.subjectCode === code && s.end > maintenant)
    .slice(0, 6);
  const taches = chargerTachesTriees(maintenant).filter((t) => t.matiere?.code === code);
  const { annonces, messages, fichiers } = ficheMatiere(getDb().db, { id: m.id, code });
  const retour = `/matieres/${encodeURIComponent(code)}`;

  return (
    <div className="max-w-3xl">
      <LienRetour href="/matieres">Matières</LienRetour>
      <Entete
        contexte={m.teacher}
        titre={m.name}
        aside={
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-encre text-[12px] font-bold text-sur-couleur shadow-[2px_2px_0_var(--ombre)]"
            style={{ background: m.color }}
          >
            {m.code}
          </span>
        }
      />
      {m.submissionsViaClassroom && (
        <p className="-mt-2 mb-5">
          <span className="pastille bg-jaune text-sur-couleur">Rendus sur Classroom</span>
        </p>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <section aria-labelledby="seances" className="mb-8">
          <TitreSection id="seances">Prochaines séances</TitreSection>
          {seances.length === 0 ? (
            <p className={vide}>Aucune séance dans les deux prochaines semaines.</p>
          ) : (
            <ol className="bloc flex flex-col bg-surface px-4 py-1">
              {seances.map((s, i) => (
                <li
                  key={`${s.start.toISOString()}-${i}`}
                  className="border-b-2 border-dashed border-ligne py-2.5 last:border-b-0"
                >
                  <p
                    className={`text-[15px] font-semibold first-letter:uppercase ${seanceSupprimee(s) ? 'text-gris line-through' : ''}`}
                  >
                    {formatDayKey(s.date, 'EEEE d MMMM')}{' '}
                    <span className="chiffres">à {formatTunis(s.start, 'HH:mm')}</span>
                  </p>
                  <p className="text-[13px] text-gris">
                    {[SESSION_TYPE_LABELS[s.type], s.room && `salle ${s.room}`]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  <DetailsChangement seance={s} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="a-faire" className="mb-8">
          <TitreSection id="a-faire">À faire</TitreSection>
          {taches.length === 0 ? (
            <p className={vide}>Rien à faire dans cette matière pour l’instant.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {taches.map((t) => (
                <LigneTache key={t.id} tache={versVue(t, maintenant)} retour={retour} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="annonces" className="mb-8">
        <TitreSection id="annonces">Annonces Classroom</TitreSection>
        {annonces.length === 0 ? (
          <p className={vide}>
            Aucune annonce. Si cette matière a un cours Classroom, vérifie qu’il est suivi et
            rattaché à la matière dans Plus → Comptes et cours.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {annonces.map((a) => (
              <li key={a.id} className="bloc bg-surface px-4 py-3">
                <p className="text-[13px] text-gris">
                  {date(a.date)}, {a.type === 'support' ? 'support de cours' : 'annonce'}
                </p>
                {a.titre && <p className="text-[15px] font-semibold">{a.titre}</p>}
                {a.texte && (
                  <p className="line-clamp-4 whitespace-pre-line text-[15px]">
                    <TexteAvecLiens texte={a.texte} />
                  </p>
                )}
                {a.lien && (
                  <a
                    href={a.lien}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[14px] font-semibold underline"
                  >
                    Ouvrir dans Classroom
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fichiers" className="mb-8">
        <TitreSection id="fichiers">Fichiers</TitreSection>
        {fichiers.length === 0 ? (
          <p className={vide}>Aucun fichier reçu pour cette matière (mails et annonces lus).</p>
        ) : (
          <ul className="bloc flex flex-col bg-surface px-4 py-1">
            {fichiers.map((f, i) => (
              <li
                key={`${f.nom}-${i}`}
                className="flex items-baseline justify-between gap-3 border-b-2 border-dashed border-ligne py-2.5 last:border-b-0"
              >
                {f.lien ? (
                  <a
                    href={f.lien}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 break-words text-[15px] font-semibold underline"
                  >
                    {f.nom}
                  </a>
                ) : (
                  <span className="min-w-0 break-words text-[15px] font-semibold">{f.nom}</span>
                )}
                <span className="shrink-0 text-[13px] text-gris">
                  {f.origine}, {date(f.date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="messages" className="mb-8">
        <TitreSection id="messages">Messages liés</TitreSection>
        {messages.length === 0 ? (
          <p className={vide}>
            Aucun message lu par l’IA pour cette matière. Les mails des profs, de la déléguée et les
            annonces arrivent ici après analyse.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {messages.map((msg) => (
              <li key={msg.id} className="bloc bg-surface px-4 py-3">
                <p className="text-[13px] text-gris">
                  {date(msg.date)}, {msg.source === 'gmail' ? 'mail' : 'Classroom'}
                  {msg.sens === 'envoye'
                    ? ' envoyé par toi'
                    : msg.expediteur
                      ? `, ${msg.expediteur}`
                      : ''}
                </p>
                <p className="text-[15px] font-semibold">{msg.titre || 'Sans objet'}</p>
                {msg.extrait && (
                  <p className="line-clamp-2 text-[14px] text-gris">
                    <TexteAvecLiens texte={msg.extrait} />
                  </p>
                )}
                {msg.lien && (
                  <p className="mt-1 text-[14px]">
                    <LienSource
                      type={msg.source}
                      href={msg.lien}
                      sourceId={msg.id}
                      retour={retour}
                    />
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
