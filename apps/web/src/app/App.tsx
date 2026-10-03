import { LazyMotion, MotionConfig, domMax } from 'motion/react';
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
import { useSceneInput } from '../scenes/useSceneInput';
import { useScene, type Scene } from './useScene';

const TOAST_MS = 3200;
const params = readTestParams(window.location.search);

export function App() {
  return (
    <LazyMotion features={domMax} strict>
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
  const [teamTouched, setTeamTouched] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lockedUntil = useRef(0);
  const aboutTitleRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
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
      lockedUntil.current = performance.now() + (calm ? DURATION.fade * 1000 : SCENE.inputLockMs);
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

  useSceneInput({ scene, go: goScene, locked, aboutScroller: () => aboutRef.current });

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

  const openTeam = () => {
    setTeamTouched(true);
    setTeamOpen(true);
  };

  return (
    <div className="page" data-scene={scene} data-team-open={teamOpen || undefined}>
      <FoodFieldLayer scene={scene} params={params} teamOpen={teamOpen} />
      <div className="stage" inert={teamOpen}>
        <HeroScene
          phase={scene === 'hero' ? 'shown' : 'hidden'}
          instant={instant}
          onAbout={() => {
            goScene('about');
          }}
          onCreateMenu={onCreateMenu}
        />
        <div className="about-scroller" ref={aboutRef}>
          <AboutScene
            phase={scene === 'about' ? 'shown' : 'hidden'}
            instant={instant}
            titleRef={aboutTitleRef}
            onBack={() => {
              goScene('hero');
            }}
            teamOpen={teamOpen}
            teamTouched={teamTouched}
            onOpenTeam={openTeam}
            onMoreRef={setMoreRef}
          />
        </div>
      </div>
      <TeamDialog
        open={teamOpen}
        onClose={() => {
          setTeamOpen(false);
        }}
        onClosed={() => {
          moreRef.current?.focus({ preventScroll: true });
        }}
      />
      <Toast message={toast} />
    </div>
  );
}
