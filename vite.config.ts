import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:3000',
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        // Le lecteur de codes-barres WebAssembly pèse plus que le seuil par défaut
        // de Workbox (2 Mo). Sans ce relèvement il resterait hors du cache, et le
        // scan cesserait de fonctionner dès que la maison perd Internet.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'Gestock',
        short_name: 'Gestock',
        description: 'Inventaire du congélateur et des placards',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Android découpe l'icône selon la forme du lanceur : le motif tient dans la
          // zone de sécurité (80 % central) et le fond couvre tout le carré.
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
