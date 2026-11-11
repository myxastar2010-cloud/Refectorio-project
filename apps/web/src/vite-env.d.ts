/// <reference types="vite/client" />

/** Build flag PHOTO_HOSTING (vite.config.ts): our own photo copies or the Unsplash hotlinks (ADR 0011). */
declare const __PHOTO_HOSTING__: 'self' | 'unsplash';

/** Test builds only (vite build --mode test): the ?step=…&state=… hook of the quiz. Stripped from production. */
declare const __TEST_HOOKS__: boolean;

interface ImportMetaEnv {
  /** Kiki's server origin for the published site (render.yaml, pages.yml); unset — the dev proxy `/api`. */
  readonly VITE_API_ORIGIN?: string;
}
