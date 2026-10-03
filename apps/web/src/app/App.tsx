import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Toast } from '../components/Toast';
import { site } from '../content/site.ru';
import { FoodFieldLayer } from '../engine/food-field/FoodFieldLayer';
import { TeamDialog } from '../features/team-dialog/TeamDialog';
import { readTestParams } from '../lib/params';
import { useCalmMotion } from '../motion/hooks';
import { DURATION, SCENE } from '../motion/tokens';
import { AboutScene } from '../scenes/AboutScene';
import { HeroScene } from '../scenes/HeroScene';
import { SiteHeader } from '../scenes/SiteHeader';
import { useSceneInput } from '../scenes/useSceneInput';
import { useScene, type Scene } from './useScene';

const TOAST_MS = 3200;
const params = readTestParams(window.location.search);

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
  const { scene, instant, go } = useScene();
  const calm = useCalmMotion();
  const [teamOpen, setTeamOpen] = useState(false);
  // From the click on «Ещё» until the closed card has landed back on its icon.
  const [teamOut, setTeamOut] = useState(false);
  const teamTileRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
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
    () => performance.now() < lockedUntil.current || teamOpenRef.current,
    [],
  );

  const goScene = useCallback(
    (next: Scene) => {
      if (locked()) return;
      const lockMs = calm ? DURATION.fade * 1000 : SCENE.inputLockMs;
      lockedUntil.current = performance.now() + lockMs;
      setBusy(true);
      window.setTimeout(() => {
        setBusy(false);
      }, lockMs);
      go(next);
    },
    [calm, go, locked],
  );

  // Entering part 2 moves focus to its title (ТЗ 6.5); leaving it returns focus to «О проекте».
  const previousScene = useRef(scene);
  useEffect(() => {
    if (previousScene.current === scene) return;
    previousScene.current = scene;
    if (scene === 'about') aboutTitleRef.current?.focus({ preventScroll: true });
    else document.querySelector<HTMLButtonElement>('.about-pill')?.focus({ preventScroll: true });
  }, [scene]);

  // Stable: a new function on every render would re-create the input listeners and reset the wheel gesture.
  const scrollerOf = useCallback(
    (of: Scene): HTMLElement | null => (of === 'hero' ? heroRef.current : aboutRef.current),
    [],
  );
  useSceneInput({ scene, go: goScene, locked, scrollerOf });
  // Effects run in order, so the input listeners above are attached by now; e2e tests wait for this mark.
  useEffect(() => {
    pageRef.current?.setAttribute('data-ready', '');
  }, []);

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
    // Stage 2 will open the quiz here; until then the link only shows a friendly note.
    event.preventDefault();
    window.history.replaceState(window.history.state, '', site.hero.cta.href);
    setToast(site.hero.cta.toast);
  };

  const setMoreRef = useCallback((node: HTMLButtonElement | null) => {
    moreRef.current = node;
  }, []);

  // Closing the team card returns focus to «Ещё» at once: the page is interactive again right away,
  // while the card's shape still settles back into the tile.
  const wasTeamOpen = useRef(teamOpen);
  useEffect(() => {
    if (wasTeamOpen.current && !teamOpen) moreRef.current?.focus({ preventScroll: true });
    wasTeamOpen.current = teamOpen;
  }, [teamOpen]);

  const openTeam = () => {
    setTeamOut(true);
    setTeamOpen(true);
  };

  return (
    <div
      ref={pageRef}
      className="page"
      data-scene={scene}
      data-team-open={teamOpen || undefined}
      data-busy={busy || undefined}
    >
      <FoodFieldLayer scene={scene} params={params} teamOpen={teamOpen} />
      <div className="stage" inert={teamOpen}>
        <SiteHeader
          phase={scene === 'hero' ? 'shown' : 'hidden'}
          instant={instant}
          scrolled={heroScrolled && scene === 'hero'}
          onAbout={() => {
            goScene('about');
          }}
        />
        <main className="scenes">
          <HeroScene
            phase={scene === 'hero' ? 'shown' : 'hidden'}
            instant={instant}
            scrollerRef={heroRef}
            onScrolled={setHeroScrolled}
            onCreateMenu={onCreateMenu}
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
            />
          </div>
        </main>
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
      <Toast message={toast} />
    </div>
  );
}
