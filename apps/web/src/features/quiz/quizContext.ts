import { createContext, useContext } from 'react';
import type { TasteDecision } from '@refectorio/contracts';
import type { QuizAction } from './flow/machine';
import type { Safety } from './flow/safety';
import type { Answers, QuizState } from './flow/types';

/** Address parameters of the quiz (only through the address bar, like the landing's test modes). */
export type QuizParams = {
  /** ?seed=123 — the dish game's card sequence (and the food field, see lib/params). */
  readonly seed: number | null;
  /** ?taste=debug — after the game: the posterior and the top-12 predicted liked/disliked dishes. */
  readonly tasteDebug: boolean;
  /** ?demo — the finale hides its honest line (screenshots, videos). */
  readonly demo: boolean;
  /** ?reveal=demo — the finale plays the reveal wave after ≈ 6 s. */
  readonly revealDemo: boolean;
  /** ?debug=answers — the validated JSON of the answers on the final screen. */
  readonly debugAnswers: boolean;
};

export function readQuizParams(search: string): QuizParams {
  const params = new URLSearchParams(search);
  const seedText = params.get('seed');
  return {
    seed: seedText !== null && /^\d{1,9}$/.test(seedText) ? Number(seedText) : null,
    tasteDebug: params.get('taste') === 'debug',
    demo: params.has('demo'),
    revealDemo: params.get('reveal') === 'demo',
    debugAnswers: params.get('debug') === 'answers',
  };
}

export type QuizApi = {
  readonly state: QuizState;
  readonly safety: Safety;
  readonly calm: boolean;
  readonly params: QuizParams;
  readonly dispatch: (action: QuizAction) => void;
  readonly patch: (patch: Partial<Answers>) => void;
  /** The step is answered: safety rules, then the next screen (or a notice first). */
  readonly next: () => void;
  /** «Вернуться» (through the browser history). */
  readonly back: () => void;
  /** Several steps back at once (the refused screen's «Изменить ответы»). */
  readonly backBy: (steps: number) => void;
  /** The finale took the progress bar over (ТЗ §12.1): the header stops drawing it. */
  readonly detachBar: () => void;
  readonly tasteAnswer: (decision: TasteDecision) => void;
  readonly openPrivacy: (opener: HTMLElement | null) => void;
  readonly exit: () => void;
  /** Screen readers: a polite announcement (the dish game, the finale). */
  readonly announce: (text: string) => void;
};

export const QuizContext = createContext<QuizApi | null>(null);

export function useQuiz(): QuizApi {
  const api = useContext(QuizContext);
  if (!api) throw new Error('useQuiz outside QuizScene');
  return api;
}

/** «{n} год|года|лет» with Intl.PluralRules('ru'). */
const pluralRules = new Intl.PluralRules('ru');
export function pluralRu(n: number, forms: { one: string; few: string; many: string }): string {
  const rule = pluralRules.select(n);
  return rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many;
}

/** Fills «{slot}» placeholders of a quiz text. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Russian number formatting with a decimal comma (70,5). */
export const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
