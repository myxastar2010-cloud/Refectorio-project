import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type Plugin } from 'vite';

/**
 * Preloads the Nunito subsets that the first screen needs (Cyrillic + Latin),
 * so text renders in the final font before the first paint whenever possible.
 */
function preloadFonts(): Plugin {
  const SUBSETS = ['nunito-cyrillic-wght-normal', 'nunito-latin-wght-normal'];
  return {
    name: 'refectorio:preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        return SUBSETS.flatMap((subset) => {
          const file = files.find((name) => name.includes(subset) && name.endsWith('.woff2'));
          return file
            ? [
                {
                  tag: 'link',
                  attrs: {
                    rel: 'preload',
                    as: 'font',
                    type: 'font/woff2',
                    href: `${base()}${file}`,
                    crossorigin: '',
                  },
                  injectTo: 'head' as const,
                },
              ]
            : [];
        });
      },
    },
  };
}

/**
 * GitHub Pages cannot send response headers, so the production build carries the CSP as a <meta> tag too
 * (Render sends the full set from render.yaml). frame-ancestors and upgrade-insecure-requests are header-only:
 * in <meta> they are ignored or break the local http preview.
 */
const META_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function metaCsp(): Plugin {
  return {
    name: 'refectorio:meta-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${META_CSP}" />`,
      ),
  };
}

/** "/" for Render, "/refectorio/" (or whatever Pages reports) for GitHub Pages. */
function base(): string {
  const value = process.env.VITE_BASE ?? '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export default defineConfig({
  base: base(),
  plugins: [
    react(),
    tailwindcss(),
    preloadFonts(),
    metaCsp(),
    process.env.ANALYZE
      ? visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true })
      : null,
  ],
  build: {
    target: 'es2022',
    // Keep fonts and images as separate cacheable files.
    assetsInlineLimit: 0,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
