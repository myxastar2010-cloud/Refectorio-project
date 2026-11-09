import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { Toast, type ToastAction, type ToastMessage } from '../components/Toast';
import { site } from '../content/site.ru';
import { FoodFieldLayer } from '../engine/food-field/FoodFieldLayer';
import { loadQuiz } from '../features/quiz/loadQuiz';
import { ProjectDialog } from '../features/team-dialog/ProjectDialog';
import { TeamDialog } from '../features/team-dialog/TeamDialog';
import { whenIdle } from '../lib/idle';
import { hasStoredMenu } from '../lib/menuFlag';
import { readTestParams } from '../lib/params';
import { focusQuietly, trackInputModality } from '../lib/quietFocus';
import { useCalmMotion } from '../motion/hooks';
import type { Point } from '../features/menu/reveal/RevealWave';
import type { PlanPictures } from '../features/pricing/pictures';
import { DURATION, MENU, PRICING, QUIZ, SCENE } from '../motion/tokens';
import { AboutScene } from '../scenes/AboutScene';
import { HeroGirl } from '../scenes/HeroGirl';
import { HeroScene } from '../scenes/HeroScene';
import { SiteHeader } from '../scenes/SiteHeader';
import { useSceneInput } from '../scenes/useSceneInput';
import { ChunkBoundary, QuizLoading } from './QuizBoundary';
import { useScene, type Scene } from './useScene';

const TOAST_MS = 3200;
const params = readTestParams(window.location.search);
const noop = (): void => undefined;

/** The expanded cards of part 2: the team's and the project's (stage 3, 4.19). */
type ExpandedCard = 'team' | 'project';

/** «Цены»: a chunk of its own (with its card pictures), fetched on hover, focus, touch or idle. */
const loadPricing = () => import('../features/pricing');
const PricingScene = lazy(() => loadPricing().then((module) => ({ default: module.PricingScene })));
let pricingRequested = false;
const prefetchPricing = () => {
  if (pricingRequested) return;
  pricingRequested = true;
  void loadPricing().catch(() => {
    pricingRequested = false;
  });
};

/** The screens under the landing (#discover: segments, progress, key functions, Kiki): a chunk of its own, on idle. */
const loadDiscover = () => import('../features/discover');
const DiscoverScene = lazy(() =>
  loadDiscover().then((module) => ({ default: module.DiscoverScene })),
);
let discoverRequested = false;
const prefetchDiscover = () => {
  if (discoverRequested) return;
  discoverRequested = true;
  void loadDiscover().catch(() => {
    discoverRequested = false;
  });
};

/** The menu app (ТЗ фаза 4): a chunk of its own, fetched during the quiz so the reveal never waits for it. */
const loadMenu = () => import('../features/menu');
const lazyMenu = () => lazy(() => loadMenu().then((module) => ({ default: module.MenuScene })));
let menuRequested: Promise<unknown> | null = null;
const prefetchMenu = (): Promise<unknown> => {
  menuRequested ??= loadMenu().catch((error: unknown) => {
    menuRequested = null;
    throw error;
  });
  return menuRequested;
};
const prefetchMenuQuietly = () => {
  void prefetchMenu().catch(noop);
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
  const [openCard, setOpenCard] = useState<ExpandedCard | null>(null);
  // From the click on «Подробнее» until the closed card has landed back on its icon (each card on its own: one may
  // still be landing while the other opens).
  const [teamOut, setTeamOut] = useState(false);
  const [projectOut, setProjectOut] = useState(false);
  const teamTileRef = useRef<HTMLDivElement>(null);
  const projectTileRef = useRef<HTMLDivElement>(null);
  // «Цены»: the scene is mounted from its first visit on (it must be there, hidden, to come in like part 2).
  const [pricingMounted, setPricingMounted] = useState(false);
  // The screens under the landing: mounted once the chunk has come (idle) or the scene is opened.
  const [discoverMounted, setDiscoverMounted] = useState(false);
  const discoverRef = useRef<HTMLDivElement>(null);
  const discoverTitleRef = useRef<HTMLHeadingElement>(null);
  const [pricingPictures, setPricingPictures] = useState<PlanPictures | null>(null);
  /** The next visit's pictures: chosen and loading from the first hover on «Цены», taken by the click. */
  const nextPricingVisit = useRef<Promise<PlanPictures> | null>(null);
  const pricingRef = useRef<HTMLButtonElement>(null);
  const pricingScrollRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  // The pointer or the focus on the toast holds it; leaving starts its time again (WCAG 2.2.1).
  const [toastHeld, setToastHeld] = useState(false);
  const notify = useCallback((text: string, action?: ToastAction) => {
    setToast({ text, id: performance.now(), action });
  }, []);
  const toastDone = useCallback(() => {
    setToast(null);
    setToastHeld(false);
  }, []);
  const [QuizScene, setQuizScene] = useState(lazyQuiz);
  const [MenuScene, setMenuScene] = useState(lazyMenu);
  /** The story's pulse: the menu page is uncovered from there (phase 4 §1). */
  const [menuReveal, setMenuReveal] = useState<Point | null>(null);
  // Read again whenever the scene changes: the quiz or «Удалить мои данные» may have changed it.
  const hasMenu = useMemo(
    () => (scene === 'hero' || scene === 'discover') && hasStoredMenu(),
    [scene],
  );
  const lockedUntil = useRef(0);
  const busyTimer = useRef(0);
  const aboutTitleRef = useRef<HTMLButtonElement>(null);
  const teamMoreRef = useRef<HTMLButtonElement>(null);
  const projectMoreRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const girlSlotRef = useRef<HTMLDivElement>(null);
  const [heroScrolled, setHeroScrolled] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const cardOpen = openCard !== null;
  const cardOpenRef = useRef(cardOpen);
  useEffect(() => {
    cardOpenRef.current = cardOpen;
  }, [cardOpen]);

  const locked = useCallback(
    () => performance.now() < lockedUntil.current || cardOpenRef.current,
    [],
  );

  // data-busy (e2e tests wait for the end of a transition by state) is written to the page itself: as React state it
  // re-rendered the whole page only to drop the mark (stage-3 performance audit, F3).
  const lockFor = useCallback((lockMs: number) => {
    lockedUntil.current = performance.now() + lockMs;
    pageRef.current?.setAttribute('data-busy', '');
    window.clearTimeout(busyTimer.current);
    busyTimer.current = window.setTimeout(() => {
      pageRef.current?.removeAttribute('data-busy');
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

  const menuFailed = useCallback(() => {
    menuRequested = null;
    setMenuScene(() => lazyMenu());
    setMenuReveal(null);
    goScene('hero');
    notify(site.notices.loadError);
  }, [goScene, notify]);

  /** The story ends in its pulse: the menu page is uncovered over the quiz, then the quiz leaves the history. */
  const revealMenu = useCallback((origin: Point) => {
    setMenuReveal(origin);
  }, []);
  const menuRevealed = useCallback(() => {
    setMenuReveal(null);
    leaveQuiz('menu');
  }, [leaveQuiz]);
  const leaveMenu = useCallback(() => {
    goScene('hero');
  }, [goScene]);

  const quizFailed = useCallback(() => {
    quizRequested = false;
    setQuizScene(() => lazyQuiz());
    exitQuiz();
    notify(site.quizShell.loadError);
  }, [exitQuiz, notify]);

  // Entering part 2 moves focus to its title (ТЗ 6.5); leaving it returns focus to «О проекте» («Цены» likewise to its
  // own button). The quiz and «Цены» move focus to their own titles.
  const previousScene = useRef(scene);
  useEffect(() => {
    if (previousScene.current === scene) return;
    const from = previousScene.current;
    previousScene.current = scene;
    if (scene === 'about') focusQuietly(aboutTitleRef.current);
    else if (scene === 'discover') focusQuietly(discoverTitleRef.current);
    else if (scene === 'hero' && (from === 'quiz' || from === 'menu')) {
      focusQuietly(document.querySelector<HTMLAnchorElement>('.cta'));
    } else if (scene === 'hero' && from === 'pricing') focusQuietly(pricingRef.current);
    else if (scene === 'hero')
      focusQuietly(document.querySelector<HTMLButtonElement>('.about-pill'));
  }, [scene]);

  // Stable: a new function on every render would re-create the input listeners and reset the wheel gesture.
  const scrollerOf = useCallback(
    (of: Scene): HTMLElement | null =>
      of === 'hero'
        ? heroRef.current
        : of === 'about'
          ? aboutRef.current
          : of === 'discover'
            ? discoverRef.current
            : of === 'pricing'
              ? pricingScrollRef.current
              : null,
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
      // The menu chunk while the person answers (an idle moment): the reveal must never wait for it.
      return whenIdle(() => {
        void prefetchMenu().catch(noop);
      }, QUIZ.prefetchAfterMs);
    }
    if (scene === 'menu') return undefined;
    let cancel = noop;
    // The two chunks in two idle periods: run in one, they made one long frame (performance audit, F6).
    const timer = window.setTimeout(() => {
      cancel = whenIdle(() => {
        prefetchQuiz();
        cancel = whenIdle(() => {
          prefetchPricing();
          cancel = whenIdle(() => {
            prefetchDiscover();
            setDiscoverMounted(true);
          }, QUIZ.prefetchAfterMs);
        }, QUIZ.prefetchAfterMs);
      }, QUIZ.prefetchAfterMs);
    }, QUIZ.prefetchAfterMs);
    return () => {
      window.clearTimeout(timer);
      cancel();
    };
  }, [scene]);

  useEffect(() => {
    if (!toast || toastHeld) return;
    // A toast with «Отменить» stays longer: there must be time to change one's mind.
    const timer = window.setTimeout(
      () => {
        setToast(null);
        setToastHeld(false);
      },
      toast.action ? MENU.undoToastMs : TOAST_MS,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast, toastHeld]);

  // Stable handlers: the scenes are memoised and re-render only when their own props change (audit, F3).
  const onCreateMenu = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      const next = hasMenu ? 'menu' : 'quiz';
      // A click during the landing's own transition (just back from the menu) is kept, not lost: it runs as it ends.
      const waitMs = lockedUntil.current - performance.now();
      if (waitMs > 0 && !cardOpenRef.current)
        window.setTimeout(() => {
          goScene(next);
        }, waitMs + 16);
      else goScene(next);
    },
    [goScene, hasMenu],
  );
  const openAbout = useCallback(() => {
    goScene('about');
  }, [goScene]);
  /** «Создать меню» on the screens under the landing: the quiz, or the stored menu. */
  const createMenuHere = useCallback(() => {
    goScene(hasMenu ? 'menu' : 'quiz');
  }, [goScene, hasMenu]);
  const toHero = useCallback(() => {
    goScene('hero');
  }, [goScene]);

  const setTeamMoreRef = useCallback((node: HTMLButtonElement | null) => {
    teamMoreRef.current = node;
  }, []);
  const setProjectMoreRef = useCallback((node: HTMLButtonElement | null) => {
    projectMoreRef.current = node;
  }, []);
  const setPricingRef = useCallback((node: HTMLButtonElement | null) => {
    pricingRef.current = node;
  }, []);

  // Closing a card returns focus to its «Подробнее» at once: the page is interactive again right away,
  // while the card's shape still settles back into the tile.
  const wasOpen = useRef(openCard);
  useEffect(() => {
    if (wasOpen.current && !openCard) {
      focusQuietly((wasOpen.current === 'team' ? teamMoreRef : projectMoreRef).current);
    }
    wasOpen.current = openCard;
  }, [openCard]);

  const closeCard = useCallback(() => {
    setOpenCard(null);
  }, []);
  const teamLanded = useCallback(() => {
    setTeamOut(false);
  }, []);
  const projectLanded = useCallback(() => {
    setProjectOut(false);
  }, []);
  // Stable props of the memoised about scene: a new object every render would re-render it each time (audit, F3).
  const teamCard = useMemo(
    () => ({
      open: openCard === 'team',
      out: teamOut,
      onOpen: () => {
        setTeamOut(true);
        setOpenCard('team');
      },
      onMoreButton: setTeamMoreRef,
    }),
    [openCard, teamOut, setTeamMoreRef],
  );
  const projectCard = useMemo(
    () => ({
      open: openCard === 'project',
      out: projectOut,
      onOpen: () => {
        setProjectOut(true);
        setOpenCard('project');
      },
      onMoreButton: setProjectMoreRef,
    }),
    [openCard, projectOut, setProjectMoreRef],
  );

  /**
   * Chooses the next visit's pair of card pictures and loads them with the chunk (once per visit): from a hover on
   * «Цены» the click finds them ready. A failed load is forgotten, so the next attempt tries again.
   */
  const prepareVisit = useCallback(() => {
    nextPricingVisit.current ??= loadPricing().then(async (module) => {
      setPricingMounted(true);
      const pictures = module.pickPictures();
      await module.preloadPictures(pictures, PRICING.pictureWaitMs);
      return pictures;
    });
    const visit = nextPricingVisit.current;
    visit.catch(() => {
      if (nextPricingVisit.current === visit) nextPricingVisit.current = null;
    });
    return visit;
  }, []);

  const prefetchVisit = useCallback(() => {
    void prepareVisit();
  }, [prepareVisit]);

  const takeVisit = useCallback(
    () =>
      prepareVisit().then((pictures) => {
        nextPricingVisit.current = null;
        setPricingPictures(pictures);
      }),
    [prepareVisit],
  );

  // «Цены»: its scene opens once the chunk and this visit's pictures are here (at most PRICING.pictureWaitMs for them).
  const openingPricing = useRef(false);
  const openPricing = useCallback(() => {
    if (locked() || openingPricing.current) return;
    openingPricing.current = true;
    prepareVisit()
      .then((pictures) => {
        // The pictures and the scene in one commit: «Цены» renders once (audit, F3).
        nextPricingVisit.current = null;
        setPricingPictures(pictures);
        goScene('pricing');
      })
      .catch(() => {
        pricingRequested = false;
        notify(site.notices.loadError);
      })
      .finally(() => {
        openingPricing.current = false;
      });
  }, [locked, prepareVisit, goScene, notify]);

  // A direct visit to #pricing (or Back / Forward to it) has no pictures yet: they come with the chunk.
  useEffect(() => {
    if (scene === 'pricing' && !pricingPictures) {
      takeVisit().catch(() => {
        notify(site.notices.loadError);
      });
    }
  }, [scene, pricingPictures, takeVisit, notify]);

  // Nothing can be bought yet.
  const choosePlan = useCallback(() => {
    notify(site.notices.noPayment);
  }, [notify]);

  const discoverFailed = useCallback(() => {
    discoverRequested = false;
    setDiscoverMounted(false);
    goScene('hero');
    notify(site.notices.loadError);
  }, [goScene, notify]);

  const pricingFailed = useCallback(() => {
    pricingRequested = false;
    goScene('hero');
    notify(site.notices.loadError);
  }, [goScene, notify]);

  const inQuiz = scene === 'quiz';
  const inMenu = scene === 'menu';
  return (
    <div ref={pageRef} className="page" data-scene={scene} data-card-open={cardOpen || undefined}>
      {/* The menu has no flying food: the engine stops while it is open (and starts afresh on the landing). */}
      {inMenu ? null : <FoodFieldLayer scene={scene} params={params} cardOpen={cardOpen} />}
      <div className="stage" inert={cardOpen || inMenu}>
        <SiteHeader
          phase={scene === 'hero' ? 'shown' : inQuiz ? 'quiz' : 'hidden'}
          instant={instant}
          scrolled={heroScrolled && scene === 'hero'}
          onAbout={openAbout}
          onExit={exitQuiz}
          pricingRef={setPricingRef}
          onPricing={openPricing}
          onPricingPrefetch={prefetchVisit}
        />
        <main className="scenes" inert={inQuiz}>
          <HeroScene
            phase={scene === 'hero' ? 'shown' : 'hidden'}
            instant={instant}
            scrollerRef={heroRef}
            onScrolled={setHeroScrolled}
            onCreateMenu={onCreateMenu}
            hasMenu={hasMenu}
            onPrefetch={hasMenu ? prefetchMenuQuietly : prefetchQuiz}
            girlSlotRef={girlSlotRef}
          />
          <div className="about-scroller" ref={aboutRef} inert={scene !== 'about'}>
            <AboutScene
              phase={scene === 'about' ? 'shown' : 'hidden'}
              instant={instant}
              titleRef={aboutTitleRef}
              onBack={toHero}
              team={teamCard}
              project={projectCard}
              teamTileRef={teamTileRef}
              projectTileRef={projectTileRef}
            />
          </div>
          {(discoverMounted || scene === 'discover') && (
            <ChunkBoundary onError={discoverFailed}>
              <Suspense fallback={null}>
                <DiscoverScene
                  phase={scene === 'discover' ? 'shown' : 'hidden'}
                  instant={instant}
                  scrollerRef={discoverRef}
                  titleRef={discoverTitleRef}
                  onHome={toHero}
                  onAbout={openAbout}
                  onCreateMenu={createMenuHere}
                  hasMenu={hasMenu}
                />
              </Suspense>
            </ChunkBoundary>
          )}
          <div className="pricing-scroller" ref={pricingScrollRef} inert={scene !== 'pricing'}>
            {(pricingMounted || scene === 'pricing') && (
              <ChunkBoundary onError={pricingFailed}>
                <Suspense fallback={null}>
                  <PricingScene
                    phase={scene === 'pricing' ? 'shown' : 'hidden'}
                    instant={instant}
                    pictures={pricingPictures}
                    onClose={toHero}
                    onChoose={choosePlan}
                  />
                </Suspense>
              </ChunkBoundary>
            )}
          </div>
        </main>
        <AnimatePresence>
          {inQuiz && (
            <ChunkBoundary key="quiz" onError={quizFailed}>
              <Suspense fallback={<QuizLoading />}>
                <QuizScene
                  instant={instant}
                  onExit={exitQuiz}
                  params={params}
                  prepareMenu={prefetchMenu}
                  onMenuReady={revealMenu}
                />
              </Suspense>
            </ChunkBoundary>
          )}
        </AnimatePresence>
      </div>
      {inMenu || menuReveal ? (
        <ChunkBoundary key="menu" onError={menuFailed}>
          <Suspense fallback={null}>
            <MenuScene
              reveal={menuReveal}
              onRevealed={menuRevealed}
              onHome={leaveMenu}
              onNotify={notify}
            />
          </Suspense>
        </ChunkBoundary>
      ) : null}
      {/* Not in the stage, which lies above the food: her page-coloured box would cut the food (--z-girl). After the
          scene in the tree: she reads its refs in her layout effect. */}
      <HeroGirl
        phase={scene === 'hero' ? 'shown' : 'hidden'}
        instant={instant}
        slotRef={girlSlotRef}
        scrollerRef={heroRef}
        frozen={params.freeze}
      />
      <TeamDialog
        open={openCard === 'team'}
        onClose={closeCard}
        tileRef={teamTileRef}
        onLanded={teamLanded}
      />
      <ProjectDialog
        open={openCard === 'project'}
        onClose={closeCard}
        tileRef={projectTileRef}
        onLanded={projectLanded}
        onNotify={notify}
      />
      <Toast message={toast} onAction={toastDone} onHold={setToastHeld} />
    </div>
  );
}
