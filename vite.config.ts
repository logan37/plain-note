import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Tauri sets these during `tauri build` / `tauri android build`. Skip the PWA
// service worker there — it only adds weight and is unused in the WebView shell.
const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM || process.env.TAURI_PLATFORM);

export default defineConfig({
  clearScreen: false,
  server: {
    // Required by Tauri: fixed port, strict so the shell can find the Vite server.
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: isTauri ? 'es2021' : 'es2022',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // One chunk is smaller/faster to load in the Android WebView than a
    // separate vendor split for this tiny app.
    rollupOptions: isTauri
      ? undefined
      : {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
            },
          },
        },
  },
  plugins: [
    react(),
    ...(!isTauri
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            includeAssets: ['icon.svg', 'icons/apple-touch-icon.png', 'icons/maskable-512.png'],
            manifest: {
              id: '/',
              name: 'Plain Note',
              short_name: 'Plain Note',
              description: 'Lightweight, encrypted, cloud-synced notes.',
              theme_color: '#0f5c49',
              background_color: '#f8f6f1',
              display: 'standalone',
              orientation: 'any',
              start_url: '/',
              scope: '/',
              categories: ['productivity', 'utilities'],
              icons: [
                { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
                { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                {
                  src: '/icons/maskable-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
              navigateFallback: '/index.html',
              cleanupOutdatedCaches: true,
              clientsClaim: true,
            },
            devOptions: {
              enabled: false,
            },
          }),
        ]
      : []),
  ],
});
