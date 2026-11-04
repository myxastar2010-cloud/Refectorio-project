import '../../styles/menu.css';
import '../../styles/menu-details.css';
import { m } from 'motion/react';
import { useEffect, useMemo } from 'react';
import type { Notify } from './notify';
import { menu } from '../../content/menu.ru';
import { readTestParams } from '../../lib/params';
import { useCalmMotion } from '../../motion/hooks';
import { MENU } from '../../motion/tokens';
import { useCatalog } from './data/catalog';
import { demoWeekTracking, ensureDemoPlan } from './data/demo';
import { useToday } from './data/today';
import { MenuPage } from './MenuPage';
import { RevealWave, type Point } from './reveal/RevealWave';
import { menuStore, useMenu } from './store/store';

type Props = {
  /** The story's pulse: the page is uncovered from there; null — a direct visit or Back. */
  readonly reveal: Point | null;
  readonly onRevealed: () => void;
  /** The logo: back to the landing (the menu stays saved). */
  readonly onHome: () => void;
  readonly onNotify: Notify;
};

const params = readTestParams(window.location.search);

/**
 * The menu app (ТЗ этапа 4, фаза 4): reads the local store, asks the worker for the items' texts and shows the page —
 * uncovered by the reveal wave when it comes from the quiz. Without a menu: a calm invitation to the quiz.
 */
export function MenuScene({ reveal, onRevealed, onHome, onNotify }: Props) {
  const calm = useCalmMotion();
  const today = useToday();
  const catalog = useCatalog();
  const status = useMenu((s) => s.status);
  const plan = useMenu((s) => s.plan);
  const stored = useMenu((s) => s.tracking);
  const tracking = useMemo(
    () => (params.weekDemo && plan ? demoWeekTracking(plan, today, stored) : stored),
    [plan, today, stored],
  );

  useEffect(() => {
    const store = menuStore();
    if (params.menuDemo) void ensureDemoPlan(store);
    else void store.load();
  }, []);

  useEffect(() => {
    const before = document.title;
    document.title = menu.docTitle;
    return () => {
      document.title = before;
    };
  }, []);

  // No menu here (and no demo plan on its way): the invitation to the quiz.
  const empty = status === 'ready' && !plan && !params.menuDemo;
  return (
    <RevealWave origin={reveal} calm={calm} onDone={onRevealed} className="menu-scene">
      {plan && catalog ? (
        <MenuPage
          plan={plan}
          tracking={tracking}
          catalog={catalog}
          today={today}
          intro={reveal !== null}
          onHome={onHome}
          onNotify={onNotify}
        />
      ) : empty ? (
        <MenuEmpty />
      ) : (
        <p className="menu-loading" role="status">
          {menu.loading}
        </p>
      )}
    </RevealWave>
  );
}

function MenuEmpty() {
  return (
    <m.section
      className="menu-empty"
      aria-labelledby="menu-empty-title"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: MENU.intro.durationS } }}
    >
      <h1 id="menu-empty-title">{menu.empty.title}</h1>
      <p>{menu.empty.text}</p>
      <a className="menu-pill menu-pill--accent" href="#quiz">
        {menu.empty.cta}
      </a>
    </m.section>
  );
}
