import { iconeTandhim } from '@/lib/icone';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Icône de l'écran d'accueil de l'iPhone (iOS arrondit les coins lui-même). */
export default function AppleIcon() {
  return iconeTandhim(180, 0.12);
}
