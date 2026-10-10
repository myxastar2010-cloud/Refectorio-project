import { quiz } from '../../../content/quiz.ru';
import { ChoiceList } from '../components/ChoiceList';
import { StepFrame } from '../components/StepFrame';
import { stepDef } from '../flow/steps';
import type { Answers, YesNo } from '../flow/types';
import { useQuiz } from '../quizContext';

type Step = 'health' | 'allergy' | 'dislikes' | 'strength';

const TITLES: Record<Step, string> = {
  health: quiz.health.title,
  allergy: quiz.allergy.title,
  dislikes: quiz.dislikes.title,
  strength: quiz.activity.strengthTitle,
};

/** The answer of each yes/no step (the field has the step's own name). */
const answerOf = (step: Step, value: YesNo): Partial<Answers> => {
  switch (step) {
    case 'health':
      return { health: value };
    case 'allergy':
      return { allergy: value };
    case 'dislikes':
      return { dislikes: value };
    case 'strength':
      return { strength: value };
  }
};

/** «Да» / «Нет» (ТЗ §8.2): radio-styled pills; «Нет» skips the sub-step. */
export function YesNoStep({ step }: { readonly step: Step }) {
  const { state, patch, next } = useQuiz();
  return (
    <StepFrame icon={stepDef(step).icon} title={TITLES[step]}>
      <ChoiceList<YesNo>
        items={[
          { value: 'yes', label: quiz.yesNo.yes },
          { value: 'no', label: quiz.yesNo.no },
        ]}
        selected={state.answers[step]}
        variant="yesno"
        labelledBy="quiz-step-title"
        onChoose={(value) => {
          patch(answerOf(step, value));
        }}
        onDone={next}
      />
    </StepFrame>
  );
}
