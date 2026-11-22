import { adressesDuTexte } from '@tandhim/core';

/**
 * Texte venu d'une source (consigne, description, citation, mail) : les adresses web deviennent
 * cliquables et les longues adresses se coupent au lieu de déborder. À utiliser pour TOUT texte
 * qui peut contenir un lien.
 */
export function TexteAvecLiens({ texte }: { texte: string | null | undefined }) {
  if (!texte) return null;
  const adresses = adressesDuTexte(texte);
  if (!adresses.length) return <>{texte}</>;
  // Découpe le texte autour de chaque adresse, dans l'ordre où elles apparaissent.
  const morceaux: { texte: string; lien: boolean }[] = [];
  let reste = texte;
  while (reste) {
    let premiere: { a: string; i: number } | undefined;
    for (const a of adresses) {
      const i = reste.indexOf(a);
      if (i >= 0 && (!premiere || i < premiere.i)) premiere = { a, i };
    }
    if (!premiere) {
      morceaux.push({ texte: reste, lien: false });
      break;
    }
    if (premiere.i > 0) morceaux.push({ texte: reste.slice(0, premiere.i), lien: false });
    morceaux.push({ texte: premiere.a, lien: true });
    reste = reste.slice(premiere.i + premiere.a.length);
  }
  return (
    <>
      {morceaux.map((m, i) =>
        m.lien ? (
          <a
            key={i}
            href={m.texte}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline [overflow-wrap:anywhere]"
          >
            {m.texte}
          </a>
        ) : (
          m.texte
        ),
      )}
    </>
  );
}
