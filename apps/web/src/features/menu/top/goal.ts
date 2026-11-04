import type { QuizAnswersV1 } from '@refectorio/contracts';
import { menu } from '../../../content/menu.ru';
import { fill, formatNumber } from '../../../lib/format';

/** «Цель: −5 кг» (typographic minus), «+3 кг», «поддержание веса»; numbers de-emphasised → «режим и баланс». */
export function goalText(answers: QuizAnswersV1 | null): string {
  if (!answers || answers.guardrails.deemphasizeNumbers) return menu.goal.calm;
  const { goal, targetWeightKg } = answers.goal;
  if (goal === 'maintain' || targetWeightKg === undefined) return menu.goal.maintain;
  const delta = formatNumber(Math.abs(answers.body.weightKg - targetWeightKg));
  return fill(goal === 'lose' ? menu.goal.lose : menu.goal.gain, { n: delta });
}
