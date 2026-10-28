import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: {conditions: ['onnxruntime-web-use-extern-wasm', 'module', 'browser', 'development|production']},
  worker: {format: 'es', plugins: () => []},
  build: {target: 'es2022'},
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
    manifest: {
      name: 'SnapBite — Food & nutrition', short_name: 'SnapBite',
      description: 'Your private, offline-first food diary.',
      theme_color: '#121212', background_color: '#121212', display: 'standalone',
      start_url: '/', scope: '/',
      icons: [{src: '/icon-192.png', sizes: '192x192', type: 'image/png'}, {src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'}, {src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable'}],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
      globIgnores: ['models/**'],
      maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      navigateFallback: '/index.html',
      // Model/runtime bytes are cached explicitly after SHA-256 validation.
      // Keep them out of Workbox runtime caching so it cannot overwrite the
      // verification headers used to establish offline readiness.
    },
  })],
});
