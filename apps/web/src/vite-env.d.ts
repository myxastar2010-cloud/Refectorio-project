/// <reference types="vite/client" />

/** Build flag PHOTO_HOSTING (vite.config.ts): our own photo copies or the Unsplash hotlinks (ADR 0011). */
declare const __PHOTO_HOSTING__: 'self' | 'unsplash';

/** Test builds only (vite build --mode test): the ?step=…&state=… hook of the quiz. Stripped from production. */
declare const __TEST_HOOKS__: boolean;

/** Kiki's server origin, checked once in vite.config.ts (https, no trailing slash); '' — the dev proxy `/api`. */
declare const __API_ORIGIN__: string;

interface ImportMetaEnv {
  /** Kiki's server origin for the published site (render.yaml, pages.yml); unset — the dev proxy `/api`. */
  readonly VITE_API_ORIGIN?: string;
}
