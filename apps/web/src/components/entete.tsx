/** En-tête de page : petite ligne de contexte au-dessus d'un grand titre gras. */
export function Entete({
  contexte,
  titre,
  aside,
  compact = false,
}: {
  contexte?: React.ReactNode;
  titre: React.ReactNode;
  aside?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {contexte && (
          <p className="text-[15px] font-medium text-gris first-letter:uppercase">{contexte}</p>
        )}
        <h1
          className={`titre leading-tight first-letter:uppercase ${compact ? 'text-[26px]' : 'text-[32px]'}`}
        >
          {titre}
        </h1>
      </div>
      {aside}
    </header>
  );
}

/** Pastille de semaine : numéro + lettre (a/b) dans un rond encre. */
export function PastilleSemaine({ numero, lettre }: { numero: number; lettre: 'a' | 'b' }) {
  return (
    <div
      className="bloc flex shrink-0 items-center gap-2 bg-surface py-1 pl-3 pr-1"
      style={{ borderRadius: 999 }}
      aria-label={`Semaine ${numero}, lettre ${lettre}`}
    >
      <span className="chiffres text-[14px] font-semibold" aria-hidden>
        Sem. {numero}
      </span>
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-full bg-encre text-[18px] font-bold text-papier"
      >
        {lettre}
      </span>
    </div>
  );
}

/** Titre de section avec lien optionnel à droite. */
export function TitreSection({
  id,
  children,
  lien,
}: {
  id: string;
  children: React.ReactNode;
  lien?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="titre text-[20px]">
        {children}
      </h2>
      {lien}
    </div>
  );
}
