import type { Metadata, Viewport } from 'next';
import { Readex_Pro } from 'next/font/google';
import './globals.css';

const readex = Readex_Pro({
  subsets: ['latin', 'arabic'],
  axes: ['HEXP'],
  variable: '--font-readex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Tandhim', template: '%s' },
  description: 'Séances, échéances et projets du semestre, au même endroit.',
  applicationName: 'Tandhim',
  appleWebApp: { capable: true, title: 'Tandhim', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Toujours clair : barre d'état et contrôles natifs (dates, listes) en clair sur iPhone aussi.
  themeColor: '#fff3dc',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={readex.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
