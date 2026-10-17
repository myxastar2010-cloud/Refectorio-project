import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type Plugin } from 'vite';
import { site } from './src/content/site.ru';

/**
 * Where the dish photos come from (ADR 0011, D-048): `self` (default) — our own copies built by
 * scripts/photos/materialize.mjs, served from this origin without a credit line; `unsplash` — the stage-2 hotlinks of
 * images.unsplash.com with the credit line (the site then reads the full manifest, and render.yaml's CSP must allow
 * that host again).
 */
const PHOTO_HOSTING = process.env.PHOTO_HOSTING === 'unsplash' ? 'unsplash' : 'self';
const hotlinked = PHOTO_HOSTING === 'unsplash';

/**
 * Preloads the Open Runde weights that the first screen needs (bold titles and buttons, semibold lead and cards),
 * so text renders in the final font before the first paint whenever possible.
 */
function preloadFonts(): Plugin {
  const SUBSETS = ['open-runde-700', 'open-runde-600'];
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
const META_CSP =
  [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    // Dish photos are served from this origin; the hotlink mode allows images.unsplash.com. Nothing else leaves the site.
    `img-src 'self' data:${hotlinked ? ' https://images.unsplash.com' : ''}`,
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // The trailing ";" keeps the policy valid when antivirus web protection appends its own directive (seen with Kaspersky).
  ].join('; ') + ';';

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

/**
 * Title, description and language come from the content file (single source of texts). Social images need an
 * absolute URL: SITE_URL (Pages workflow) or RENDER_EXTERNAL_URL (set by Render during builds); locally — relative.
 */
function siteMeta(): Plugin {
  const escape = (text: string) =>
    text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const origin = process.env.SITE_URL ?? process.env.RENDER_EXTERNAL_URL ?? '';
  const siteUrl = origin ? `${origin.replace(/\/$/, '')}${base()}` : base();
  return {
    name: 'refectorio:site-meta',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%SITE_LANG%', site.meta.lang)
        .replaceAll('%SITE_TITLE%', escape(site.meta.title))
        .replaceAll('%SITE_DESCRIPTION%', escape(site.meta.description))
        .replaceAll('%SITE_URL%', siteUrl),
  };
}

/** "/" for Render, "/Refectorio-project/" (whatever Pages reports) for GitHub Pages. */
function base(): string {
  const value = process.env.VITE_BASE ?? '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export default defineConfig({
  base: base(),
  define: { __PHOTO_HOSTING__: JSON.stringify(PHOTO_HOSTING) },
  resolve: {
    alias: hotlinked
      ? {
          // The hotlink mode needs the CDN addresses and authors, which the slim runtime copy leaves out.
          '@refectorio/taste-core/data/photo-runtime.json': fileURLToPath(
            new URL('../../packages/taste-core/data/photo-manifest.json', import.meta.url),
          ),
        }
      : {},
  },
  plugins: [
    react(),
    tailwindcss(),
    preloadFonts(),
    metaCsp(),
    siteMeta(),
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
