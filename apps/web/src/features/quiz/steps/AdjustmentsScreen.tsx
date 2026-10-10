import { IconShieldCheck } from '@tabler/icons-react';
import { quiz } from '../../../content/quiz.ru';
import { ContinueButton } from '../components/PillButton';
import { StepFrame } from '../components/StepFrame';
import { useEnterToContinue } from '../components/useEnterToContinue';
import { useQuiz } from '../quizContext';

/**
 * Before the finale (ТЗ §8.7): every answer the quiz switched to a safe option is listed once more, so nothing changed
 * silently. «Вернуться» goes back to the questions; «Далее» starts the finale.
 */
export function AdjustmentsScreen() {
  const { state, next } = useQuiz();
  useEnterToContinue(true, next);
  return (
    <StepFrame
      icon={null}
      title={quiz.adjustments.title}
      footer={<ContinueButton show label={quiz.common.next} onClick={next} />}
      className="quiz-frame--adjustments"
    >
      <ul className="quiz-adjustments">
        {state.adjustments.map((id) => (
          <li key={id} className="quiz-adjustment">
            <IconShieldCheck aria-hidden stroke={2} className="quiz-adjustment-icon" />
            <span>{quiz.adjustments[id]}</span>
          </li>
        ))}
      </ul>
    </StepFrame>
  );
}
