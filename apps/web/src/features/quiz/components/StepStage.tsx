import { AnimatePresence, m, useIsPresent } from 'motion/react';
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { whenIdle } from '../../../lib/idle';
import { QUIZ } from '../../../motion/tokens';
import { historyDepth } from '../flow/machine';
import { nextStepId, stepDef, type IconKey } from '../flow/steps';
import type { Screen } from '../flow/types';
import { useQuiz } from '../quizContext';
import { preloadQuizIcons, type QuizIconName } from '../quizIcons';
import { AdjustmentsScreen } from '../steps/AdjustmentsScreen';
import { ChipsStep } from '../steps/ChipsStep';
import { ExtraGoalsStep } from '../steps/ExtraGoalsStep';
import { OptionsStep } from '../steps/OptionsStep';
import { RowsStep } from '../steps/RowsStep';
import { TextStep } from '../steps/TextStep';
import { YesNoStep } from '../steps/YesNoStep';
import { TasteStep } from '../tinder/TasteStep';
import { fitScreen, overflows } from './fit';
import { StepMotionContext, type PresenceInfo, type StepMotion } from './stepMotion';

/**
 * The finale (core, captions, reveal) is a chunk of its own, like its WebGL core: both are fetched on idle during the
 * last steps (ТЗ §12.2), so the quiz chunk stays within its budget and the finale opens without waiting.
 */
const loadFinale = () => import('../finale/Finale');
const Finale = lazy(() => loadFinale().then((module) => ({ default: module.Finale })));

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
  extraGoals: [
    'o-extra-clothes',
    'o-extra-health',
    'o-extra-fitness',
    'o-extra-energy',
    'o-extra-sleep',
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
    case 'extraGoals':
      return <ExtraGoalsStep />;
    case 'dislikesText':
    case 'notes':
      return <TextStep step={screen} />;
    case 'adjustments':
      return <AdjustmentsScreen />;
    case 'finale':
      return (
        <Suspense fallback={null}>
          <Finale />
        </Suspense>
      );
  }
}

/**
 * The fit of a screen (4.11, components/fit.ts): measured before the step is painted, so it enters at its final
 * scale; if the step grows beyond what was reserved (a long note, many custom chips), fitted again at once — never
 * tweened. A new window size fits it afresh, except while a text field has the focus (a phone keyboard).
 */
function useStepFit(ref: RefObject<HTMLDivElement | null>, present: boolean) {
  useLayoutEffect(() => {
    const screen = ref.current;
    if (screen) fitScreen(screen);
  }, [ref]);
  useEffect(() => {
    const screen = ref.current;
    const frame = screen?.firstElementChild;
    if (!screen || !(frame instanceof HTMLElement) || !present) return undefined;
    // Re-fitted in the next frame, not inside the observer's callback (that would resize what it observes: a loop).
    let frameId = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        if (overflows(screen)) fitScreen(screen);
      });
    });
    observer.observe(frame);
    const onResize = () => {
      if (document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;
      fitScreen(screen);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [ref, present]);
}

/**
 * A step enters once the icons and photos in it are decoded (4.5: nothing pops in after the blur-in), at most
 * QUIZ.imagesWaitMs — they were decoded ahead while the previous step was shown, so usually at once.
 */
function useImagesReady(ref: RefObject<HTMLDivElement | null>) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const screen = ref.current;
    if (!screen) return undefined;
    let live = true;
    const pending = [...screen.querySelectorAll('img')].filter(
      (image) => !(image.complete && image.naturalWidth > 0),
    );
    const decoded = Promise.all(pending.map((image) => image.decode().catch(() => undefined)));
    const waited = new Promise((resolve) => window.setTimeout(resolve, QUIZ.imagesWaitMs));
    void Promise.race([decoded, waited]).then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [ref]);
  return ready;
}

/** One screen: fitted to the window (it never scrolls); while leaving it is inert and hidden from assistive technology. */
function ScreenView({ screen, motion }: { readonly screen: Screen; readonly motion: StepMotion }) {
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  useStepFit(ref, present);
  const ready = useImagesReady(ref);

  // A scrolled step (only in a window too small to fit, quiz.css) slides under the header: a frosted band then.
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
        data-entering={ready || undefined}
        initial="enter"
        animate={ready ? 'center' : 'enter'}
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

  const nearTheEnd = screen === 'lifestyle' || screen === 'notes' || screen === 'adjustments';
  useEffect(() => {
    if (!nearTheEnd) return undefined;
    return whenIdle(() => {
      void loadFinale();
      void import('../finale/story/story');
      void import('../finale/story/story-data.json');
    }, QUIZ.finalePrefetchIdleMs);
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
