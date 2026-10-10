import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { whenIdle } from '../../../lib/idle';
import { QUIZ } from '../../../motion/tokens';
import { historyDepth } from '../flow/machine';
import { nextStepId, stepDef, type IconKey } from '../flow/steps';
import type { Screen } from '../flow/types';
import { useQuiz } from '../quizContext';
import { preloadQuizIcons, type QuizIconName } from '../quizIcons';
import { AdjustmentsScreen } from '../steps/AdjustmentsScreen';
import { ChipsStep } from '../steps/ChipsStep';
import { OptionsStep } from '../steps/OptionsStep';
import { RowsStep } from '../steps/RowsStep';
import { TextStep } from '../steps/TextStep';
import { YesNoStep } from '../steps/YesNoStep';
import { Finale } from '../finale/Finale';
import { TasteStep } from '../tinder/TasteStep';
import { StepMotionContext, type PresenceInfo, type StepMotion } from './stepMotion';

const iconOf = (screen: Screen): IconKey | null =>
  screen === 'finale' || screen === 'adjustments' ? null : stepDef(screen).icon;

/** Option icons a step shows (preloaded with the next step). */
const OPTION_ICONS: Partial<Record<Screen, QuizIconName[]>> = {
  goal: ['o-goal-lose', 'o-goal-gain', 'o-goal-maintain'],
  foodStyle: ['o-diet-omnivore', 'o-diet-pescatarian', 'o-diet-vegetarian', 'o-diet-vegan'],
  macroProfile: [
    'o-macro-recommended',
    'o-macro-high-protein',
    'o-macro-low-carb',
    'o-macro-keto',
    'o-macro-low-fat',
  ],
  lifestyle: [
    'o-life-sitting',
    'o-life-sometimes',
    'o-life-standing',
    'o-life-moving',
    'o-life-labour',
  ],
};

function ScreenBody({ screen }: { readonly screen: Screen }): ReactNode {
  switch (screen) {
    case 'taste':
      return <TasteStep />;
    case 'body':
    case 'goalSetup':
      return <RowsStep step={screen} />;
    case 'goal':
    case 'foodStyle':
    case 'macroProfile':
    case 'activity':
    case 'lifestyle':
      return <OptionsStep step={screen} />;
    case 'health':
    case 'allergy':
    case 'dislikes':
    case 'strength':
      return <YesNoStep step={screen} />;
    case 'healthConditions':
    case 'allergens':
      return <ChipsStep step={screen} />;
    case 'dislikesText':
    case 'notes':
      return <TextStep step={screen} />;
    case 'adjustments':
      return <AdjustmentsScreen />;
    case 'finale':
      return <Finale />;
  }
}

/** One screen: its own scroll container; while leaving it is inert and hidden from assistive technology. */
function ScreenView({ screen, motion }: { readonly screen: Screen; readonly motion: StepMotion }) {
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);

  // A scrolled step slides under the header: the header gets a frosted band then (like the landing's).
  useEffect(() => {
    const element = ref.current;
    if (!element || !present) return undefined;
    const quiz = element.closest('.quiz');
    const update = () => {
      quiz?.toggleAttribute('data-scrolled', element.scrollTop > 2);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      element.removeEventListener('scroll', update);
    };
  }, [present]);

  return (
    <StepMotionContext.Provider value={motion}>
      <m.div
        ref={ref}
        className="quiz-screen"
        data-screen={screen}
        initial="enter"
        animate="center"
        exit="exit"
        inert={!present}
        aria-hidden={!present || undefined}
      >
        <ScreenBody screen={screen} />
      </m.div>
    </StepMotionContext.Provider>
  );
}

/**
 * The steps' stage (ТЗ §7.6): the old screen dissolves while the new one comes into focus; both are stacked
 * absolutely and scroll on their own. The first screen of the quiz waits for part 1 of the landing to leave.
 */
export function StepStage({ instant }: { readonly instant: boolean }) {
  const { state } = useQuiz();
  const screen = state.screen;
  const depth = historyDepth(state);
  const icon = iconOf(screen);
  // The previous screen, kept in state (React's «information from previous renders» pattern): direction and the
  // still icon are decided when the screen changes.
  const [track, setTrack] = useState<{
    screen: Screen;
    depth: number;
    icon: IconKey | null;
    motion: StepMotion;
  }>(() => ({
    screen,
    depth,
    icon,
    motion: {
      direction: 1,
      enterDelayMs: instant ? 0 : QUIZ.firstStepDelayMs,
      iconStill: false,
    },
  }));
  let motion = track.motion;
  if (track.screen !== screen) {
    motion = {
      direction: depth < track.depth ? -1 : 1,
      enterDelayMs: QUIZ.stepIn.delayMs,
      iconStill: icon !== null && track.icon === icon,
    };
    setTrack({ screen, depth, icon, motion });
  }

  // The finale's WebGL core is a chunk of its own: fetched on idle during the last steps (ТЗ §12.2).
  const nearTheEnd = screen === 'lifestyle' || screen === 'notes' || screen === 'adjustments';
  useEffect(() => {
    if (!nearTheEnd) return undefined;
    return whenIdle(() => {
      void import('../finale/coreGl');
    }, 2000);
  }, [nearTheEnd]);

  // The next step's icons are decoded while this one is shown.
  useEffect(() => {
    if (screen === 'finale' || screen === 'adjustments') return;
    const next = nextStepId(screen, state.answers);
    if (!next) return;
    const names: QuizIconName[] = [...(OPTION_ICONS[next] ?? [])];
    const nextIcon = stepDef(next).icon;
    if (nextIcon) names.push(nextIcon);
    preloadQuizIcons(names);
  }, [screen, state.answers]);

  const presence: PresenceInfo = { icon };
  return (
    <div className="quiz-stage">
      <AnimatePresence initial={!instant} custom={presence}>
        <ScreenView key={screen} screen={screen} motion={motion} />
      </AnimatePresence>
    </div>
  );
}
