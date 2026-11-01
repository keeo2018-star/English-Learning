import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'Noted', short_name: 'Noted',
    description: 'Your personal English learning notebook.',
    start_url: '/', scope: '/', display: 'standalone',
    background_color: '#f5f4ef', theme_color: '#f5f4ef', lang: 'en',
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
