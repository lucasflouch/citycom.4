
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'], 
      manifest: {
        name: 'Guía Comercial Argentina',
        short_name: 'GuíaComercial',
        description: 'Descubrí y contactá los mejores comercios de tu zona.',
        theme_color: '#6366f1',
        background_color: '#f8fafc',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // ESTRATEGIA DE CACHÉ SEGURA (CRÍTICO PARA SOLUCIONAR LOGIN/LOGOUT)
        runtimeCaching: [
          {
            // Bloquear caché para Supabase (Auth, DB, Functions)
            urlPattern: ({ url }) => {
              return (
                url.hostname.includes('supabase.co') || 
                url.pathname.includes('/auth/v1') ||
                url.pathname.includes('/rest/v1') ||
                url.pathname.includes('/functions/v1')
              );
            },
            handler: 'NetworkOnly',
          },
          {
            // Bloquear caché para Mercado Pago y APIs locales
            urlPattern: ({ url }) => {
              return (
                url.hostname.includes('mercadopago.com') ||
                url.pathname.startsWith('/api')
              );
            },
            handler: 'NetworkOnly',
          }
        ]
      }
    })
  ],
  base: '/', 
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
