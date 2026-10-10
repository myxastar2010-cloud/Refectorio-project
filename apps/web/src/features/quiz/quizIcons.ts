import iconManifest from '../../assets/generated/quiz-icons.json';

/** Question and option icons (scripts/quiz-icons.mjs): AVIF + WebP at 2× the display box (1× for small sources). */
const urls = import.meta.glob<string>('../../assets/generated/quiz/*.{avif,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export type QuizIconName = keyof typeof iconManifest;

export type QuizIcon = {
  readonly avif: string;
  readonly webp: string;
  readonly width: number;
  readonly height: number;
  /** The file's density for its display box (2 — sharp on Retina; 1 — the team's small sources). */
  readonly density: number;
};

export function quizIcon(name: QuizIconName): QuizIcon {
  const meta = iconManifest[name];
  const avif = urls[`../../assets/generated/quiz/${name}.avif`];
  const webp = urls[`../../assets/generated/quiz/${name}.webp`];
  if (!avif || !webp) throw new Error(`Quiz icon is missing: ${name} — run "npm run quiz-icons"`);
  return { avif, webp, width: meta.width, height: meta.height, density: meta.density };
}

const preloaded = new Set<string>();

/** Decodes icons ahead (the next step's icons while the current one is shown). */
export function preloadQuizIcons(names: readonly QuizIconName[]) {
  for (const name of names) {
    if (preloaded.has(name)) continue;
    preloaded.add(name);
    const image = new Image();
    image.decoding = 'async';
    // <picture> picks AVIF wherever it is supported (all current browsers): preload the same file.
    image.src = quizIcon(name).avif;
    void image.decode().catch(() => undefined);
  }
}
