import {
  IconCirclePlusFilled,
  IconPencilFilled,
  IconSchoolFilled,
  IconShieldCheckFilled,
  IconSparklesFilled,
  type Icon,
} from '@tabler/icons-react';
import { m, type MotionStyle } from 'motion/react';
import type { MouseEvent, Ref } from 'react';
import type { FeatureIcon } from '../content/schema';
import { site } from '../content/site.ru';
import { useCalmMotion } from '../motion/hooks';
import { TILT } from '../motion/tokens';
import { TiltGlare } from '../motion/TiltGlare';
import { useWave } from '../motion/useWave';
import { WaveLayer } from '../motion/WaveHover';
import { heroFadeVariants, heroLiftVariants, heroVariants, type Phase } from './choreography';
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

/**
 * Part 1: heading, lead, «Создать меню» and the four feature cards (ТЗ 6.2; the cards are not shown on phones);
 * the header is SiteHeader.
 */
export function HeroScene({ phase, instant, scrollerRef, onScrolled, onCreateMenu }: Props) {
  const calm = useCalmMotion();
  const hidden = phase === 'hidden';
  const {
    setHost: ctaRef,
    handlers: ctaWave,
    clipPath: ctaClip,
    act: afterCtaWave,
  } = useWave<HTMLAnchorElement>();
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

      {/* The slot only moves; the glass button fades and blurs itself (see choreography.ts heroLiftVariants). */}
      <m.div
        className="cta-slot at box"
        data-opaque
        variants={heroLiftVariants(2, calm)}
        animate={phase}
        {...(instant ? { initial: false as const } : {})}
      >
        <TiltGlare maxDeg={TILT.ctaMaxDeg} className="cta-tilt">
          <m.a
            ref={ctaRef}
            href={site.hero.cta.href}
            variants={heroFadeVariants(2, calm)}
            className="cta wave-host focus-ring"
            onClick={(event) => {
              afterCtaWave(event, onCreateMenu);
            }}
            {...ctaWave}
          >
            <span className="wave-content">
              <span>{site.hero.cta.label}</span>
              <IconCirclePlusFilled aria-hidden className="cta-icon" />
            </span>
            <WaveLayer clipPath={ctaClip} className="wave-layer--ink">
              <span>{site.hero.cta.label}</span>
              <IconCirclePlusFilled aria-hidden className="cta-icon" />
            </WaveLayer>
          </m.a>
        </TiltGlare>
      </m.div>

      <ul className="features" aria-label={site.hero.featuresLabel}>
        {site.hero.features.map((feature, index) => {
          const FeatureIconComponent = FEATURE_ICONS[feature.icon];
          return (
            <m.li
              key={feature.title}
              className="feature-card at box"
              style={{ '--i': index } as MotionStyle}
              data-opaque
              {...motionProps(3)}
            >
              <TiltGlare maxDeg={TILT.featureCardMaxDeg} className="feature-surface" glare>
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
    </section>
  );
}
