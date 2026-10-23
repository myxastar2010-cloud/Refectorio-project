import { quiz } from '../../../content/quiz.ru';
import { useWave } from '../../../motion/useWave';
import { WaveLayer } from '../../../motion/WaveHover';
import { useQuiz } from '../quizContext';

/**
 * «Как мы используем ваши данные?» (ТЗ §7.5): a quiet text button; on hover the landing's wave, but in the accent
 * colour (a red fill grows from the pointer inside a pill, the text turns white); on touch the wave fills, then the
 * sheet opens.
 */
export function PrivacyLabel() {
  const { openPrivacy } = useQuiz();
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  return (
    <button
      ref={setHost}
      type="button"
      className="quiz-privacy-label wave-host"
      aria-haspopup="dialog"
      onClick={(event) => {
        const opener = event.currentTarget;
        act(event, () => {
          openPrivacy(opener);
        });
      }}
      {...handlers}
    >
      <span className="wave-content">{quiz.common.privacyLink}</span>
      <WaveLayer clipPath={clipPath} className="wave-layer--accent-fill">
        {quiz.common.privacyLink}
      </WaveLayer>
    </button>
  );
}
