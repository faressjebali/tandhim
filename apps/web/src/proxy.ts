import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, isValidSessionToken } from '@/lib/auth';

/** Toute page exige une session valide, sauf la connexion, la santé et les fichiers de l'app. */
export function proxy(request: NextRequest) {
  // Mode démo : données fictives, pas de mot de passe.
  if (process.env.TANDHIM_DEMO === '1') return NextResponse.next();
  if (isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ erreur: 'Connexion requise' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/connexion';
  url.search = pathname === '/' ? '' : `?suite=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!connexion|api/health|_next/static|_next/image|icone|apple-icon|manifest.webmanifest|sw.js|favicon.ico).*)',
  ],
};
