import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Escribe dist/_headers (Cloudflare Pages) con la política de seguridad de contenido. */
function securityHeaders(apiBase: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'lcj-security-headers',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      let apiOrigin = '';
      try {
        apiOrigin = apiBase ? new URL(apiBase).origin : '';
      } catch {
        throw new Error(`VITE_API_BASE inválida: ${apiBase}`);
      }
      const csp = [
        "default-src 'self'",
        "script-src 'self' https://challenges.cloudflare.com",
        'frame-src https://challenges.cloudflare.com',
        `connect-src 'self' ${apiOrigin}`.trim(),
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "base-uri 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
      ].join('; ');
      const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/sw.js
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
      writeFileSync(join(outDir, '_headers'), headers);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'La comida justa',
          short_name: 'Comida justa',
          description: 'Planificá comidas, calculá porciones y comprá solo lo necesario. De Llegar a fin de mes.',
          lang: 'es-AR',
          theme_color: '#3f6b3c',
          background_color: '#fbf6ec',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,jpg,woff2,webmanifest}'],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          // Las llamadas al servidor de licencias nunca se guardan en caché.
          runtimeCaching: [],
        },
      }),
      securityHeaders(env.VITE_API_BASE ?? ''),
    ],
    build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 800 },
    server: { port: 5173 },
  };
});
