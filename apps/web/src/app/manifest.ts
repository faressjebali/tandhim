import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tandhim',
    short_name: 'Tandhim',
    description: 'Séances, échéances et projets du semestre, au même endroit.',
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fff3dc',
    theme_color: '#fff3dc',
    icons: [
      { src: '/icone/192', sizes: '192x192', type: 'image/png' },
      { src: '/icone/512', sizes: '512x512', type: 'image/png' },
      { src: '/icone/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
