import { iconeTandhim } from '@/lib/icone';

const TAILLES: Record<string, { px: number; marge: number }> = {
  '192': { px: 192, marge: 0.12 },
  '512': { px: 512, marge: 0.12 },
  'maskable-512': { px: 512, marge: 0.2 },
};

export async function GET(_: Request, { params }: { params: Promise<{ taille: string }> }) {
  const t = TAILLES[(await params).taille];
  if (!t) return new Response('Taille inconnue', { status: 404 });
  return iconeTandhim(t.px, t.marge);
}
