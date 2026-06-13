import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Plugin } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

function ignoreNodeBinariesPlugin(): Plugin {
  return {
    name: 'ignore-node-binaries',
    enforce: 'pre',
    resolveId(id) {
      if (id.endsWith('.node')) return { id, external: true };
    },
  };
}

function copyPDFWorkerPlugin(): Plugin {
  return {
    name: 'copy-pdf-worker',
    buildStart() {
      const dest = resolve('public/workers');
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
      const src = resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
      if (existsSync(src)) {
        copyFileSync(src, resolve(dest, 'pdf.worker.min.mjs'));
      }
    },
  };
}

export default defineConfig({
  integrations: [
    react(),
    AstroPWA({
      registerType: 'prompt',
      devOptions: { enabled: true },
      manifest: {
        name: 'LocalKit',
        short_name: 'LocalKit',
        description: 'Privacy-first PDF, image & video tools — 100% in your browser, no uploads',
        theme_color: '#0284c7',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'pwa-64x64.png',              sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png',            sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',            sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png',  sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'apple-touch-icon-180x180.png', sizes: '180x180', type: 'image/png' },
        ],
        screenshots: [
          {
            src: 'screenshot-wide.png',
            sizes: '2560x1264',
            type: 'image/png',
            form_factor: 'wide',
            label: 'LocalKit — Privacy-first file tools',
          },
          {
            src: 'screenshot-mobile.png',
            sizes: '780x1688',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'LocalKit — Privacy-first file tools',
          },
        ],
      },
      workbox: {
        // Precache all built assets
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,mjs}'],
        // Don't precache the large PDF worker — handle at runtime
        globIgnores: ['**/pdf.worker.min.mjs'],
        // Offline fallback page
        navigateFallback: '/',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // PDF worker — cache first, long TTL
          {
            urlPattern: /\/workers\/pdf\.worker\.min\.mjs/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-worker-v1',
              expiration: { maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          // FFmpeg WASM files from unpkg CDN
          {
            urlPattern: /unpkg\.com\/@ffmpeg/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ffmpeg-cdn-v1',
              expiration: { maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // AI model files (background removal ONNX)
          {
            urlPattern: /\.onnx$|\.wasm$|\/models\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ai-models-v1',
              expiration: {
                maxAgeSeconds: 60 * 24 * 60 * 60,
                maxEntries: 20,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google Fonts
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-v1',
              expiration: { maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // App pages — network first, fall back to cache
          {
            urlPattern: /^https?:\/\/[^/]+\/(?:pdf|image|video|faq|privacy)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-v1',
              expiration: { maxAgeSeconds: 7 * 24 * 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  vite: {
    resolve: {
      alias: {
        '@scribe.js/canvas': resolve(__dirname, 'src/lib/stubs/scribe-canvas-stub.js'),
      },
    },
    plugins: [tailwindcss(), copyPDFWorkerPlugin(), ignoreNodeBinariesPlugin()],
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      exclude: ['pdfjs-dist', '@ffmpeg/ffmpeg', '@ffmpeg/util', 'scribe.js-ocr'],
    },
    build: {
      rollupOptions: {},
    },
  },
});
