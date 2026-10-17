import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Toast, type ToastMessage } from '../components/Toast';
import type { PlanId } from '../content/schema';
import { site } from '../content/site.ru';
import { FoodFieldLayer } from '../engine/food-field/FoodFieldLayer';
import { loadQuiz } from '../features/quiz/loadQuiz';
import { TeamDialog } from '../features/team-dialog/TeamDialog';
import { whenIdle } from '../lib/idle';
import { readTestParams } from '../lib/params';
import { focusQuietly, trackInputModality } from '../lib/quietFocus';
import { useCalmMotion } from '../motion/hooks';
import { DURATION, QUIZ, SCENE } from '../motion/tokens';
import { AboutScene } from '../scenes/AboutScene';
import { HeroScene } from '../scenes/HeroScene';
import { SiteHeader } from '../scenes/SiteHeader';
import { useSceneInput } from '../scenes/useSceneInput';
import { QuizBoundary, QuizLoading } from './QuizBoundary';
import { useScene, type Scene } from './useScene';

const TOAST_MS = 3200;
const params = readTestParams(window.location.search);
const noop = (): void => undefined;

/** «Цены»: a chunk of its own, fetched on hover, focus, touch or idle — the landing does not carry it. */
const loadPricing = () => import('../features/pricing/PricingDialog');
const PricingDialog = lazy(() =>
  loadPricing().then((module) => ({ default: module.PricingDialog })),
);
let pricingRequested = false;
const prefetchPricing = () => {
  if (pricingRequested) return;
  pricingRequested = true;
  void loadPricing().catch(() => {
    pricingRequested = false;
  });
};

/** A fresh lazy component: after a failed load the next «Создать меню» must try again, not rethrow. */
const lazyQuiz = () => lazy(() => loadQuiz().then((module) => ({ default: module.QuizScene })));
let quizRequested = false;
/** Hover, focus or touch on «Создать меню»: start loading the quiz before the click. */
const prefetchQuiz = () => {
  if (quizRequested) return;
  quizRequested = true;
  void loadQuiz().catch(() => {
    quizRequested = false;
  });
};

export function App() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <Page />
      </MotionConfig>
    </LazyMotion>
  );
}

function Page() {
  const { scene, instant, go, leaveQuiz } = useScene();
  const calm = useCalmMotion();
  const [teamOpen, setTeamOpen] = useState(false);
  // From the click on «Ещё» until the closed card has landed back on its icon.
  const [teamOut, setTeamOut] = useState(false);
  const teamTileRef = useRef<HTMLDivElement>(null);
  // «Цены»: open, and out (open or flying back to its pill).
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingOut, setPricingOut] = useState(false);
  const [pricingMounted, setPricingMounted] = useState(false);
  const pricingRef = useRef<HTMLButtonElement>(null);
  const pricingOutRef = useRef(false);
  const quizAfterPricing = useRef(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = useCallback((text: string) => {
    setToast({ text, id: performance.now() });
  }, []);
  const [QuizScene, setQuizScene] = useState(lazyQuiz);
  // Exposed as data-busy: e2e tests wait for the end of a transition by state, not by timeouts.
  const [busy, setBusy] = useState(false);
  const lockedUntil = useRef(0);
  const aboutTitleRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [heroScrolled, setHeroScrolled] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const teamOpenRef = useRef(teamOpen);
  useEffect(() => {
    teamOpenRef.current = teamOpen;
  }, [teamOpen]);

  const locked = useCallback(
    () => performance.now() < lockedUntil.current || teamOpenRef.current || pricingOutRef.current,
    [],
  );

  const lockFor = useCallback((lockMs: number) => {
    lockedUntil.current = performance.now() + lockMs;
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
    }, lockMs);
  }, []);

  const goScene = useCallback(
    (next: Scene) => {
      if (locked()) return;
      lockFor(calm ? DURATION.fade * 1000 : next === 'quiz' ? QUIZ.inputLockMs : SCENE.inputLockMs);
      go(next);
    },
    [calm, go, locked, lockFor],
  );

  const exitQuiz = useCallback(() => {
    lockFor(calm ? DURATION.fade * 1000 : QUIZ.inputLockMs);
    leaveQuiz();
  }, [calm, leaveQuiz, lockFor]);

  const quizFailed = useCallback(() => {
    quizRequested = false;
    setQuizScene(() => lazyQuiz());
    exitQuiz();
    notify(site.quizShell.loadError);
  }, [exitQuiz, notify]);

  // Entering part 2 moves focus to its title (ТЗ 6.5); leaving it returns focus to «О проекте». The quiz moves focus
  // to its own step title.
  const previousScene = useRef(scene);
  useEffect(() => {
    if (previousScene.current === scene) return;
    const from = previousScene.current;
    previousScene.current = scene;
    if (scene === 'about') focusQuietly(aboutTitleRef.current);
    else if (scene === 'hero' && from === 'quiz') {
      focusQuietly(document.querySelector<HTMLAnchorElement>('.cta'));
    } else if (scene === 'hero')
      focusQuietly(document.querySelector<HTMLButtonElement>('.about-pill'));
  }, [scene]);

  // Stable: a new function on every render would re-create the input listeners and reset the wheel gesture.
  const scrollerOf = useCallback(
    (of: Scene): HTMLElement | null =>
      of === 'hero' ? heroRef.current : of === 'about' ? aboutRef.current : null,
    [],
  );
  useSceneInput({ scene, go: goScene, locked, scrollerOf });
  useEffect(() => {
    trackInputModality();
  }, []);
  // Effects run in order, so the input listeners above are attached by now; e2e tests wait for this mark.
  useEffect(() => {
    pageRef.current?.setAttribute('data-ready', '');
  }, []);
  useEffect(() => {
    // A direct visit to #quiz needs the chunk at once; otherwise it is fetched when the page is idle.
    if (scene === 'quiz') {
      prefetchQuiz();
      return undefined;
    }
    let cancel = noop;
    const timer = window.setTimeout(() => {
      cancel = whenIdle(() => {
        prefetchQuiz();
        prefetchPricing();
      }, QUIZ.prefetchAfterMs);
    }, QUIZ.prefetchAfterMs);
    return () => {
      window.clearTimeout(timer);
      cancel();
    };
  }, [scene]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, TOAST_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  const onCreateMenu = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    goScene('quiz');
  };

  const setMoreRef = useCallback((node: HTMLButtonElement | null) => {
    moreRef.current = node;
  }, []);
  const setPricingRef = useCallback((node: HTMLButtonElement | null) => {
    pricingRef.current = node;
  }, []);

  // Closing the team card returns focus to «Ещё» at once: the page is interactive again right away,
  // while the card's shape still settles back into the tile.
  const wasTeamOpen = useRef(teamOpen);
  useEffect(() => {
    if (wasTeamOpen.current && !teamOpen) focusQuietly(moreRef.current);
    wasTeamOpen.current = teamOpen;
  }, [teamOpen]);

  const openTeam = () => {
    setTeamOut(true);
    setTeamOpen(true);
  };

  const openPricing = () => {
    if (locked()) return;
    pricingOutRef.current = true;
    setPricingOut(true);
    // Opened once its chunk is here (usually prefetched on hover); a failed load unlocks the page and says so.
    loadPricing()
      .then(() => {
        setPricingMounted(true);
        setPricingOpen(true);
      })
      .catch(() => {
        pricingRequested = false;
        pricingOutRef.current = false;
        setPricingOut(false);
        notify(site.notices.loadError);
      });
  };

  // Closing the plans returns focus to «Цены» at once (like the team card and «Ещё»).
  const wasPricingOpen = useRef(pricingOpen);
  useEffect(() => {
    if (wasPricingOpen.current && !pricingOpen && !quizAfterPricing.current) {
      focusQuietly(pricingRef.current);
    }
    wasPricingOpen.current = pricingOpen;
  }, [pricingOpen]);

  const pricingLanded = () => {
    pricingOutRef.current = false;
    setPricingOut(false);
    if (quizAfterPricing.current) {
      quizAfterPricing.current = false;
      goScene('quiz');
    }
  };

  const choosePlan = (plan: PlanId) => {
    if (plan === 'free') {
      // «Начать бесплатно»: the card returns to its pill, then the quiz opens.
      quizAfterPricing.current = true;
      setPricingOpen(false);
      return;
    }
    notify(site.notices.noPayment);
  };

  const inQuiz = scene === 'quiz';
  return (
    <div
      ref={pageRef}
      className="page"
      data-scene={scene}
      data-team-open={teamOpen || undefined}
      data-pricing-open={pricingOpen || undefined}
      data-pricing-out={pricingOut || undefined}
      data-busy={busy || undefined}
    >
      <FoodFieldLayer scene={scene} params={params} teamOpen={teamOpen} pricingOpen={pricingOpen} />
      <div className="stage" inert={teamOpen || pricingOpen}>
        <SiteHeader
          phase={scene === 'hero' ? 'shown' : inQuiz ? 'quiz' : 'hidden'}
          instant={instant}
          scrolled={heroScrolled && scene === 'hero'}
          onAbout={() => {
            goScene('about');
          }}
          onExit={exitQuiz}
          pricingRef={setPricingRef}
          pricingOpen={pricingOpen}
          onPricing={openPricing}
          onPricingPrefetch={prefetchPricing}
        />
        <main className="scenes" inert={inQuiz}>
          <HeroScene
            phase={scene === 'hero' ? 'shown' : 'hidden'}
            instant={instant}
            scrollerRef={heroRef}
            onScrolled={setHeroScrolled}
            onCreateMenu={onCreateMenu}
            onPrefetch={prefetchQuiz}
          />
          <div className="about-scroller" ref={aboutRef} inert={scene !== 'about'}>
            <AboutScene
              phase={scene === 'about' ? 'shown' : 'hidden'}
              instant={instant}
              titleRef={aboutTitleRef}
              onBack={() => {
                goScene('hero');
              }}
              teamOpen={teamOpen}
              teamOut={teamOut}
              tileRef={teamTileRef}
              onOpenTeam={openTeam}
              onMoreRef={setMoreRef}
              onNotify={notify}
            />
          </div>
        </main>
        <AnimatePresence>
          {inQuiz && (
            <QuizBoundary key="quiz" onError={quizFailed}>
              <Suspense fallback={<QuizLoading />}>
                <QuizScene instant={instant} onExit={exitQuiz} params={params} />
              </Suspense>
            </QuizBoundary>
          )}
        </AnimatePresence>
      </div>
      <TeamDialog
        open={teamOpen}
        onClose={() => {
          setTeamOpen(false);
        }}
        tileRef={teamTileRef}
        onLanded={() => {
          setTeamOut(false);
        }}
      />
      {pricingMounted ? (
        <Suspense fallback={null}>
          <PricingDialog
            open={pricingOpen}
            onClose={() => {
              setPricingOpen(false);
            }}
            anchorRef={pricingRef}
            onLanded={pricingLanded}
            onChoose={choosePlan}
          />
        </Suspense>
      ) : null}
      <Toast message={toast} />
    </div>
  );
}
