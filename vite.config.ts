/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> dist/ (almindeligt build)
// `npm run build:single` -> dist-single/index.html (hele spillet i én fil, kan åbnes med dobbeltklik)
// App-links (manifest og ikoner) kun i den almindelige version – én-fils-versionen har ingen filer ved siden af
const appLinks = {
  name: 'klodskamp-app-links',
  transformIndexHtml: (html: string) => html.replace('</head>', `    <link rel="manifest" href="manifest.webmanifest" />
    <link rel="apple-touch-icon" href="apple-touch-icon.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png" />
    <meta name="apple-mobile-web-app-title" content="Klodskamp" />
  </head>`),
};

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [appLinks],
  // `public/` (manifest, ikoner) kopieres kun til app-versionen
  publicDir: mode === 'single' ? false : 'public',
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 2000,
  },
  server: { open: true, host: true },
  test: { include: ['tests/**/*.test.ts'] },
}));
