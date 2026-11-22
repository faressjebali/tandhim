import { ImageResponse } from 'next/og';

/**
 * Icône de l'app : la barre du jour (cinq créneaux, la pause de midi, un créneau libre)
 * cerclée d'encre et le repère « maintenant » en corail, sur fond jaune (style rétro).
 * `marge` réserve la zone de sécurité des icônes « maskable » (Android).
 */
export function iconeTandhim(taille: number, marge = 0.16): ImageResponse {
  const interieur = taille * (1 - 2 * marge);
  // Positions des créneaux sur l'axe 08:00 → 17:15 (555 min), en fraction.
  const creneaux = [
    { debut: 0, couleur: '#ff8a75' },
    { debut: 105 / 555, couleur: '#fb7da8' },
    { debut: 210 / 555, couleur: null },
    { debut: 360 / 555, couleur: '#5db7f0' },
    { debut: 465 / 555, couleur: '#9d85f2' },
  ];
  const largeur = (90 / 555) * interieur;
  const hauteur = interieur * 0.36;
  const rayon = hauteur * 0.22;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffc567',
      }}
    >
      <div style={{ position: 'relative', width: interieur, height: hauteur, display: 'flex' }}>
        {creneaux.map((c, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: c.debut * interieur,
              top: 0,
              width: largeur,
              height: hauteur,
              borderRadius: rayon,
              background: c.couleur ?? 'transparent',
              border: `${Math.max(2, taille / 64)}px ${c.couleur ? 'solid' : 'dashed'} #1e1b2e`,
              boxShadow: c.couleur ? `${taille / 80}px ${taille / 80}px 0 #1e1b2e` : 'none',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: (250 / 555) * interieur,
            top: -hauteur * 0.28,
            width: Math.max(4, taille / 40),
            height: hauteur * 1.56,
            borderRadius: 99,
            background: '#fd5a46',
            border: `${Math.max(1, taille / 128)}px solid #1e1b2e`,
          }}
        />
      </div>
    </div>,
    { width: taille, height: taille },
  );
}
