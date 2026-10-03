import {
  IconCirclePlusFilled,
  IconPencilFilled,
  IconSchoolFilled,
  IconShieldCheckFilled,
  IconSparklesFilled,
  type Icon,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { m, type MotionStyle } from 'motion/react';
import { useState, type MouseEvent, type Ref } from 'react';
import type { FeatureIcon } from '../content/schema';
import { site } from '../content/site.ru';
import { useCalmMotion } from '../motion/hooks';
import { TILT } from '../motion/tokens';
import { TiltGlare } from '../motion/TiltGlare';
import { heroVariants, type Phase } from './choreography';
import { useViewport } from '../lib/useViewport';
import { Lines } from '../components/Lines';

const FEATURE_ICONS: Record<FeatureIcon, Icon> = {
  school: IconSchoolFilled,
  sparkles: IconSparklesFilled,
  pencil: IconPencilFilled,
  shieldCheck: IconShieldCheckFilled,
};

type Props = {
  readonly phase: Phase;
  readonly instant: boolean;
  /** The section itself: on small screens part 1 scrolls when it does not fit (useSceneInput reads it). */
  readonly scrollerRef: Ref<HTMLElement>;
  readonly onScrolled: (scrolled: boolean) => void;
  readonly onCreateMenu: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/** Part 1: heading, lead, «Создать меню» and the four feature cards (ТЗ 6.2); the header is SiteHeader. */
export function HeroScene({ phase, instant, scrollerRef, onScrolled, onCreateMenu }: Props) {
  const calm = useCalmMotion();
  const viewport = useViewport();
  const hidden = phase === 'hidden';
  const [activeCard, setActiveCard] = useState(0);
  const variants = (index: number) => heroVariants(index, calm);
  const motionProps = (index: number) => ({
    variants: variants(index),
    animate: phase,
    ...(instant ? { initial: false as const } : {}),
  });

  return (
    <section
      ref={scrollerRef}
      className="scene scene--hero"
      aria-labelledby="hero-title"
      inert={hidden}
      aria-hidden={hidden}
      data-scene-active={!hidden}
      onScroll={(event) => {
        onScrolled(event.currentTarget.scrollTop > 0);
      }}
    >
      <m.h1 id="hero-title" className="hero-title at text-at" data-food-avoid {...motionProps(1)}>
        <Lines lines={site.hero.titleLines} />
      </m.h1>

      <m.p className="hero-lead at text-at" data-food-avoid {...motionProps(2)}>
        <Lines lines={site.hero.leadLines} />
      </m.p>

      <m.div className="cta-slot at box" data-opaque {...motionProps(2)}>
        <TiltGlare maxDeg={TILT.ctaMaxDeg} className="cta-tilt">
          <a href={site.hero.cta.href} className="cta focus-ring" onClick={onCreateMenu}>
            <span>{site.hero.cta.label}</span>
            <IconCirclePlusFilled aria-hidden className="cta-icon" />
          </a>
        </TiltGlare>
      </m.div>

      <ul
        className="features focus-ring"
        aria-label={viewport.phone ? site.hero.carouselLabel : site.hero.featuresLabel}
        data-carousel
        // On phones the cards scroll sideways: the list must be reachable by keyboard (arrows scroll it).
        tabIndex={viewport.phone ? 0 : undefined}
        onScroll={(event) => {
          const list = event.currentTarget;
          const card = list.firstElementChild?.getBoundingClientRect().width ?? 1;
          setActiveCard(Math.round(list.scrollLeft / Math.max(1, card)));
        }}
      >
        {site.hero.features.map((feature, index) => {
          const FeatureIconComponent = FEATURE_ICONS[feature.icon];
          return (
            <m.li
              key={feature.title}
              className={clsx('feature-card at box')}
              style={{ '--i': index } as MotionStyle}
              data-opaque
              {...motionProps(3)}
            >
              <TiltGlare maxDeg={TILT.featureCardMaxDeg} className="feature-surface">
                <p className="feature-title at text-at">{feature.title}</p>
                <p className="feature-text at text-at">
                  <Lines lines={feature.textLines} />
                </p>
                <FeatureIconComponent aria-hidden className="feature-icon" />
              </TiltGlare>
            </m.li>
          );
        })}
      </ul>
      <m.div className="carousel-dots" aria-hidden {...motionProps(3)}>
        {site.hero.features.map((feature, index) => (
          <span key={feature.title} className="carousel-dot" data-active={index === activeCard} />
        ))}
      </m.div>
    </section>
  );
}
