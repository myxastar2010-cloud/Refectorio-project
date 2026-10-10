import {
  AGE_LIMITS,
  EXERCISE_FREQUENCIES,
  LIFESTYLES,
  MACRO_PROFILES,
} from '@refectorio/nutrition-core';
import { useMemo } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { ChoiceList, type ChoiceItem } from '../components/ChoiceList';
import { StepFrame } from '../components/StepFrame';
import { ketoAllowed } from '../flow/safety';
import { stepDef } from '../flow/steps';
import type { FoodStyle, QuizGoal } from '../flow/types';
import { useQuiz } from '../quizContext';
import { tasteHintsOf } from '../tinder/tasteSession';

type Step = 'goal' | 'foodStyle' | 'macroProfile' | 'activity' | 'lifestyle';

const GOALS: readonly QuizGoal[] = ['lose', 'gain', 'maintain'];
const FOOD_STYLES: readonly FoodStyle[] = ['omnivore', 'pescatarian', 'vegetarian', 'vegan'];
const GOAL_ICONS = {
  lose: 'o-goal-lose',
  gain: 'o-goal-gain',
  maintain: 'o-goal-maintain',
} as const;
const DIET_ICONS = {
  omnivore: 'o-diet-omnivore',
  pescatarian: 'o-diet-pescatarian',
  vegetarian: 'o-diet-vegetarian',
  vegan: 'o-diet-vegan',
} as const;
const MACRO_ICONS = {
  recommended: 'o-macro-recommended',
  highProtein: 'o-macro-high-protein',
  lowCarb: 'o-macro-low-carb',
  keto: 'o-macro-keto',
  lowFat: 'o-macro-low-fat',
} as const;
const LIFE_ICONS = {
  mostlySitting: 'o-life-sitting',
  sometimesStanding: 'o-life-sometimes',
  mostlyStanding: 'o-life-standing',
  movingAllDay: 'o-life-moving',
  physicalLabour: 'o-life-labour',
} as const;

/** Single-choice questions (ТЗ §8.1): goal, food preferences, diet type, activity, lifestyle. */
export function OptionsStep({ step }: { readonly step: Step }) {
  const { state, safety, patch, next } = useQuiz();
  const a = state.answers;
  const icon = stepDef(step).icon;
  const titleId = 'quiz-step-title';

  // The dish game may have noticed «no meat» / «no fish»: a gentle tag, never a choice made for the person.
  const suggestedStyle = useMemo<FoodStyle | null>(() => {
    if (step !== 'foodStyle') return null;
    const hints = tasteHintsOf(a.tasteSeed, a.tasteDecisions);
    if (hints.includes('avoidsMeat') && hints.includes('avoidsFish')) return 'vegetarian';
    if (hints.includes('avoidsMeat')) return 'pescatarian';
    return null;
  }, [step, a.tasteSeed, a.tasteDecisions]);

  switch (step) {
    case 'goal': {
      const allowed = safety.decision.allowedGoals;
      const minor = (a.ageYears ?? 30) < AGE_LIMITS.minorUnderYears;
      const items: ChoiceItem<QuizGoal>[] = GOALS.map((goal) => ({
        value: goal,
        label: quiz.goal.options[goal].label,
        icon: GOAL_ICONS[goal],
        disabled: goal !== 'maintain' && !allowed.includes(goal),
      }));
      const note =
        minor && (a.ageYears ?? 30) < AGE_LIMITS.childUnderYears
          ? quiz.notices.childFamily
          : minor
            ? quiz.notices.teenGoals
            : null;
      return (
        <StepFrame icon={icon} title={quiz.goal.title}>
          <ChoiceList
            items={items}
            selected={a.goal}
            variant="options"
            labelledBy={titleId}
            onChoose={(goal) => {
              patch({ goal });
            }}
            onDone={next}
          />
          {note ? <p className="quiz-note">{note}</p> : null}
        </StepFrame>
      );
    }
    case 'foodStyle':
      return (
        <StepFrame icon={icon} title={quiz.foodStyle.title} dense>
          <ChoiceList
            items={FOOD_STYLES.map((style) => ({
              value: style,
              label: quiz.foodStyle.options[style].label,
              description: quiz.foodStyle.options[style].description,
              icon: DIET_ICONS[style],
              ...(style === suggestedStyle ? { tag: quiz.foodStyle.suggested } : {}),
            }))}
            selected={a.foodStyle}
            variant="wide"
            labelledBy={titleId}
            onChoose={(foodStyle) => {
              patch({ foodStyle });
            }}
            onDone={next}
          />
        </StepFrame>
      );
    case 'macroProfile': {
      const keto = ketoAllowed(safety.decision);
      return (
        <StepFrame icon={icon} title={quiz.macroProfile.title} dense>
          <ChoiceList
            items={MACRO_PROFILES.map((profile) => ({
              value: profile,
              label: quiz.macroProfile.options[profile].label,
              description: quiz.macroProfile.options[profile].description,
              icon: MACRO_ICONS[profile],
              ...(profile === 'keto' && !keto
                ? { disabled: true, tag: quiz.macroProfile.unavailable }
                : {}),
            }))}
            selected={a.macroProfile}
            variant="widest"
            labelledBy={titleId}
            onChoose={(macroProfile) => {
              patch({ macroProfile });
            }}
            onDone={next}
          />
        </StepFrame>
      );
    }
    case 'activity':
      return (
        <StepFrame icon={icon} title={quiz.activity.title} dense>
          <ChoiceList
            items={EXERCISE_FREQUENCIES.map((exercise) => ({
              value: exercise,
              label: quiz.activity.options[exercise],
            }))}
            selected={a.exercise}
            variant="short"
            labelledBy={titleId}
            onChoose={(exercise) => {
              patch({ exercise });
            }}
            onDone={next}
          />
        </StepFrame>
      );
    case 'lifestyle':
      return (
        <StepFrame icon={icon} title={quiz.lifestyle.title} dense>
          <ChoiceList
            items={LIFESTYLES.map((lifestyle) => ({
              value: lifestyle,
              label: quiz.lifestyle.options[lifestyle],
              icon: LIFE_ICONS[lifestyle],
            }))}
            selected={a.lifestyle}
            variant="short"
            labelledBy={titleId}
            onChoose={(lifestyle) => {
              patch({ lifestyle });
            }}
            onDone={next}
          />
        </StepFrame>
      );
  }
}
