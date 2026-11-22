import Link from 'next/link';

const LIBELLES: Record<string, string> = {
  gmail: 'Lire le message',
  classroom: 'Ouvrir dans Classroom',
  messenger: 'Ouvrir dans Element',
  drive: 'Ouvrir dans Drive',
};

/**
 * Lien vers la source d'un élément.
 * - Mail : lu DANS l'app (l'app Gmail de l'iPhone n'accepte pas les liens vers un mail précis).
 * - Classroom, Messenger (Element), Drive : l'original, comme avant (décision de Fares, 21/11/2026).
 */
export function LienSource({
  type,
  sourceId,
  href,
  retour,
  className = 'font-semibold underline',
}: {
  /** gmail, classroom, messenger, drive */
  type?: string | null;
  sourceId?: number | null;
  href?: string | null;
  /** Page où revenir depuis la lecture d'un mail. */
  retour?: string;
  className?: string;
}) {
  const libelle = LIBELLES[type ?? ''] ?? 'Ouvrir l’original';
  if (type === 'gmail' && sourceId)
    return (
      <Link
        href={`/sources/${sourceId}${retour ? `?retour=${encodeURIComponent(retour)}` : ''}`}
        className={className}
      >
        {libelle}
      </Link>
    );
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {libelle}
    </a>
  );
}
