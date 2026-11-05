import '../../styles/discover.css';

import { IconArrowRight, IconChevronUp } from '@tabler/icons-react';
import { m } from 'motion/react';
import { memo, useEffect, useRef, type Ref } from 'react';
import { BrandLogo } from '../../components/BrandLogo';
import { discover } from '../../content/discover.ru';
import { site } from '../../content/site.ru';
import { useCalmMotion } from '../../motion/hooks';
import { DURATION, EASE_OUT_EXPO } from '../../motion/tokens';
import type { Phase } from '../../scenes/choreography';
import { Features } from './Features';
import { KikiSection } from './KikiSection';
import { Segments } from './Segments';

type Props = {
  readonly phase: Phase;
  readonly instant: boolean;
  /** The element that scrolls: useSceneInput reads it to tell a scroll from a scene change. */
  readonly scrollerRef: Ref<HTMLDivElement>;
  readonly titleRef: Ref<HTMLHeadingElement>;
  readonly onHome: () => void;
  readonly onAbout: () => void;
  readonly onCreateMenu: () => void;
  readonly hasMenu: boolean;
};

const SECTIONS = [
  { id: 'dsc-features', label: discover.features.eyebrow },
  { id: 'dsc-kiki', label: discover.kiki.title },
  { id: 'dsc-segments', label: discover.segments.eyebrow },
] as const;

/**
 * The screens under the landing (#discover), in this order: key functions, Kiki, who ПроЛанч is for with the 30-second test
 * (D-102: Kiki is the centre of the product, the «progress and goals» block is gone).
 * A scene of its own that scrolls natively; at its top a scroll up leads back to the landing, at its bottom a scroll
 * down to «О проекте» (useSceneInput). Blocks appear as they enter the view.
 */
/* memo: a scene change re-rendered every scene, the hidden ones too (stage-3 performance audit, F3). */
export const DiscoverScene = memo(function DiscoverScene({
  phase,
  instant,
  scrollerRef,
  titleRef,
  onHome,
  onAbout,
  onCreateMenu,
  hasMenu,
}: Props) {
  const calm = useCalmMotion();
  const hidden = phase === 'hidden';
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Blocks come in as they enter the view; without IntersectionObserver they are simply there.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const blocks = root.querySelectorAll<HTMLElement>('[data-reveal]');
    if (typeof IntersectionObserver === 'undefined') {
      blocks.forEach((block) => {
        block.dataset.in = '';
      });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.in = '';
          observer.unobserve(entry.target);
        }
      },
      { root, rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    blocks.forEach((block) => {
      observer.observe(block);
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  const jump = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  };

  const setRoot = (node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (typeof scrollerRef === 'function') scrollerRef(node);
    else if (scrollerRef) (scrollerRef as { current: HTMLDivElement | null }).current = node;
  };

  return (
    <m.section
      className="scene scene--discover"
      aria-label={discover.nav.label}
      inert={hidden}
      aria-hidden={hidden}
      data-scene-active={!hidden}
      initial={instant ? false : 'hidden'}
      animate={phase}
      variants={{
        hidden: {
          opacity: 0,
          transform: 'translate3d(0px, 48px, 0px)',
          transition: { duration: DURATION.fade * 1.5, ease: EASE_OUT_EXPO },
        },
        shown: {
          opacity: 1,
          transform: 'translate3d(0px, 0px, 0px)',
          transition: { duration: calm ? DURATION.fade : 0.7, ease: EASE_OUT_EXPO },
        },
      }}
    >
      <div className="dsc-scroller" ref={setRoot}>
        <header className="dsc-bar">
          <button
            type="button"
            className="dsc-brand"
            onClick={onHome}
            aria-label={`${site.brand.name}: ${discover.nav.home.toLowerCase()}`}
          >
            <BrandLogo className="dsc-brand-logo" sizes="40px" />
            <span>{site.brand.name}</span>
          </button>
          <nav className="dsc-nav" aria-label={discover.nav.label}>
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  jump(section.id);
                }}
              >
                {section.label}
              </button>
            ))}
          </nav>
          <button type="button" className="dsc-pill" onClick={onHome}>
            <IconChevronUp aria-hidden />
            {discover.nav.home}
          </button>
        </header>

        <main className="dsc-main">
          <h1 className="visually-hidden" ref={titleRef} tabIndex={-1}>
            {discover.title}
          </h1>
          <Features />
          <KikiSection />
          <Segments hasMenu={hasMenu} onCreateMenu={onCreateMenu} />

          <section className="dsc-final" data-reveal aria-labelledby="dsc-final-title">
            <h2 id="dsc-final-title">{discover.cta.title}</h2>
            <p>{discover.cta.lead}</p>
            <div className="dsc-actions dsc-actions--center">
              <button type="button" className="dsc-btn dsc-btn--big" onClick={onCreateMenu}>
                {hasMenu ? site.hero.ctaOpen.label : site.hero.cta.label}
                <IconArrowRight aria-hidden />
              </button>
              <button
                type="button"
                className="dsc-btn dsc-btn--ghost dsc-btn--big"
                onClick={onAbout}
              >
                {discover.cta.about}
              </button>
            </div>
          </section>
        </main>
      </div>
    </m.section>
  );
});
