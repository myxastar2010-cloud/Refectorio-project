import type { QuizAnswersV1 } from '@refectorio/contracts';
import type { Plan } from '@refectorio/menu-core';
import { targetWeightBoundsKg } from '@refectorio/nutrition-core';
import { m } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { WheelPicker } from '../../../components/wheel/WheelPicker';
import { menu } from '../../../content/menu.ru';
import { fill, formatNumber, formatWhole } from '../../../lib/format';
import { Sheet } from '../components/Sheet';
import { menuClient } from '../engine/client';

type Goal = QuizAnswersV1['goal']['goal'];
const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain'];

type Props = {
  readonly anchor: HTMLElement | null;
  readonly answers: QuizAnswersV1 | null;
  readonly plan: Plan;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onApply: (answers: QuizAnswersV1) => void;
};

/** The target weight range of a goal for this person (the quiz's own rule, nutrition-core), or null. */
function boundsOf(answers: QuizAnswersV1, goal: Goal) {
  if (goal === 'maintain') return null;
  return targetWeightBoundsKg({
    goal,
    currentKg: answers.body.weightKg,
    heightCm: answers.body.heightCm,
    ageYears: answers.body.ageYears,
  });
}

/** The answers with another goal; a weight goal keeps a target inside its range. */
function withGoal(answers: QuizAnswersV1, goal: Goal, targetKg: number): QuizAnswersV1 {
  if (goal === 'maintain') return { ...answers, goal: { goal } };
  return { ...answers, goal: { goal, targetWeightKg: targetKg } };
}

/**
 * «Изменить цель» (ТЗ фаза 4 §10.1): the goal (options the guardrails forbid are greyed with the reason), the target
 * weight on the quiz's wheel, and a preview of the day's energy before → after from the engine; «Применить» re-plans the
 * future and offers «Отменить».
 */
export function GoalSheet({ anchor, answers, plan, busy, onClose, onApply }: Props) {
  return (
    <Sheet anchor={answers ? anchor : null} name="goal" className="goal-sheet" onClose={onClose}>
      {(reveal) =>
        answers ? (
          <GoalBody
            answers={answers}
            plan={plan}
            busy={busy}
            reveal={reveal}
            onClose={onClose}
            onApply={onApply}
          />
        ) : null
      }
    </Sheet>
  );
}

function GoalBody({
  answers,
  plan,
  busy,
  reveal,
  onClose,
  onApply,
}: Omit<Props, 'anchor' | 'answers'> & {
  readonly answers: QuizAnswersV1;
  readonly reveal: Parameters<Parameters<typeof Sheet>[0]['children']>[0];
}) {
  const allowed = new Set<string>(answers.guardrails.allowedGoals);
  const [goal, setGoal] = useState<Goal>(answers.goal.goal);
  const bounds = boundsOf(answers, goal);
  const fallbackKg = bounds ? (goal === 'lose' ? bounds.maxKg : bounds.minKg) : 0;
  const [targets, setTargets] = useState<Partial<Record<Goal, number>>>(() =>
    answers.goal.targetWeightKg === undefined
      ? {}
      : { [answers.goal.goal]: answers.goal.targetWeightKg },
  );
  const targetKg = Math.min(
    Math.max(targets[goal] ?? fallbackKg, bounds?.minKg ?? 0),
    bounds?.maxKg ?? Infinity,
  );
  const weightGoal = goal !== 'maintain';
  const valid = !weightGoal || bounds !== null;
  const next = useMemo(
    () => (valid ? withGoal(answers, goal, targetKg) : null),
    [answers, goal, targetKg, valid],
  );
  const deemphasize = answers.guardrails.deemphasizeNumbers;
  const [preview, setPreview] = useState<{ key: string; kcal: number } | null>(null);
  const key = `${goal}:${String(targetKg)}`;

  // The engine's targets for the new answers (nothing is re-planned yet).
  useEffect(() => {
    if (!next || deemphasize) return undefined;
    let alive = true;
    const timer = window.setTimeout(() => {
      menuClient()
        .request({ type: 'targets', answers: next })
        .then((answer) => {
          if (alive && answer.type === 'targets')
            setPreview({ key, kcal: answer.targets.energyKcal });
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [next, key, deemphasize]);

  const before = plan.targets.energyKcal;
  const after = preview?.key === key ? preview.kcal : null;
  const unchanged = goal === answers.goal.goal && targetKg === (answers.goal.targetWeightKg ?? 0);

  return (
    <div className="goal">
      <m.h2 id="goal-title" className="goal-title" {...reveal(0)}>
        {menu.goalSheet.title}
      </m.h2>
      <m.div
        role="radiogroup"
        aria-label={menu.goalSheet.label}
        className="goal-options"
        {...reveal(1)}
      >
        {GOALS.map((g) => {
          const off = g !== 'maintain' && !allowed.has(g);
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={goal === g}
              aria-disabled={off || undefined}
              className="goal-option"
              onClick={() => {
                if (!off) setGoal(g);
              }}
            >
              <span>{menu.goalSheet.options[g]}</span>
              {off ? <span className="goal-option-note">{menu.goalSheet.unavailable}</span> : null}
            </button>
          );
        })}
      </m.div>
      {weightGoal ? (
        <m.div className="goal-target" {...reveal(2)}>
          <p className="goal-target-title">
            {menu.goalSheet.target}
            <span>{fill(menu.goalSheet.now, { n: formatNumber(answers.body.weightKg) })}</span>
          </p>
          {bounds ? (
            <WheelPicker
              key={goal}
              range={{ min: bounds.minKg, max: bounds.maxKg, step: 1 }}
              value={targetKg}
              onChange={(kg) => {
                setTargets((t) => ({ ...t, [goal]: kg }));
              }}
              unit={() => menu.goalSheet.kg}
              label={menu.goalSheet.target}
              decimals={1}
              onCommit={() => undefined}
              messages={menu.goalSheet}
            />
          ) : (
            <p className="goal-note">{menu.goalSheet.noTarget}</p>
          )}
        </m.div>
      ) : null}
      <m.div className="goal-preview" {...reveal(3)} aria-live="polite">
        {deemphasize ? null : (
          <p className="goal-preview-line">
            <span>{menu.goalSheet.preview}</span>
            <b>
              {after === null
                ? '…'
                : after === before
                  ? menu.goalSheet.previewSame
                  : fill(menu.goalSheet.previewValue, {
                      before: formatWhole(before),
                      after: formatWhole(after),
                    })}
            </b>
          </p>
        )}
        <p className="goal-note">{menu.goalSheet.changes}</p>
      </m.div>
      <m.div className="goal-actions" {...reveal(4)}>
        <button
          type="button"
          className="goal-apply"
          disabled={!next || unchanged || busy}
          onClick={() => {
            if (next) onApply(next);
          }}
        >
          {menu.goalSheet.apply}
        </button>
        <button type="button" className="goal-cancel" onClick={onClose}>
          {menu.goalSheet.cancel}
        </button>
      </m.div>
    </div>
  );
}
