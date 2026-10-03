import {
  IconApple,
  IconCirclePlusFilled,
  IconPencilFilled,
  IconSchoolFilled,
  IconShieldCheckFilled,
  IconSparklesFilled,
  type Icon,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { m, type MotionStyle } from 'motion/react';
import type { MouseEvent } from 'react';
import type { FeatureIcon } from '../content/schema';
import { site } from '../content/site.ru';
import { useCalmMotion } from '../motion/hooks';
import { TILT } from '../motion/tokens';
import { TiltGlare } from '../motion/TiltGlare';
import { useWave } from '../motion/useWave';
import { WaveLayer } from '../motion/WaveHover';
import { heroVariants, type Phase } from './choreography';

const FEATURE_ICONS: Record<FeatureIcon, Icon> = {
  school: IconSchoolFilled,
  sparkles: IconSparklesFilled,
  pencil: IconPencilFilled,
  shieldCheck: IconShieldCheckFilled,
};

type Props = {
  readonly phase: Phase;
  readonly instant: boolean;
  readonly onAbout: () => void;
  readonly onCreateMenu: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/** Part 1: header, heading, lead, «Создать меню» and the four feature cards (ТЗ 6.2). */
export function HeroScene({ phase, instant, onAbout, onCreateMenu }: Props) {
  const calm = useCalmMotion();
  const hidden = phase === 'hidden';
  const {
    setHost: aboutPillRef,
    handlers: aboutPillWave,
    clipPath: aboutPillClip,
  } = useWave<HTMLButtonElement>();
  const variants = (index: number) => heroVariants(index, calm);
  const motionProps = (index: number) => ({
    variants: variants(index),
    animate: phase,
    ...(instant ? { initial: false as const } : {}),
  });

  return (
    <>
      <m.header className="site-header" inert={hidden} aria-hidden={hidden} {...motionProps(0)}>
        <div className="brand">
          <IconApple aria-hidden className="brand-icon at box" stroke={2} />
          <span className="brand-name at text-at">{site.brand.name}</span>
        </div>
        <button
          ref={aboutPillRef}
          type="button"
          className="about-pill at box wave-host focus-ring"
          onClick={onAbout}
          {...aboutPillWave}
        >
          <span className="wave-content">{site.hero.aboutButton}</span>
          <WaveLayer clipPath={aboutPillClip} className="wave-layer--ink">
            {site.hero.aboutButton}
          </WaveLayer>
        </button>
      </m.header>

      <section
        className="scene scene--hero"
        aria-labelledby="hero-title"
        inert={hidden}
        aria-hidden={hidden}
        data-scene-active={!hidden}
      >
        <m.h1 id="hero-title" className="hero-title at text-at" data-food-avoid {...motionProps(1)}>
          {site.hero.titleLines.map((line) => (
            <span key={line} className="line">
              {line}
            </span>
          ))}
        </m.h1>

        <m.p className="hero-lead at text-at" data-food-avoid {...motionProps(2)}>
          {site.hero.leadLines.map((line) => (
            <span key={line} className="line">
              {line}
            </span>
          ))}
        </m.p>

        <m.div className="cta-slot at box" data-opaque {...motionProps(2)}>
          <TiltGlare maxDeg={TILT.ctaMaxDeg} className="cta-tilt">
            <a href={site.hero.cta.href} className="cta focus-ring" onClick={onCreateMenu}>
              <span>{site.hero.cta.label}</span>
              <IconCirclePlusFilled aria-hidden className="cta-icon" />
            </a>
          </TiltGlare>
        </m.div>

        <ul className="features" aria-label={site.hero.featuresLabel}>
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
                    {feature.textLines.map((line) => (
                      <span key={line} className="line">
                        {line}
                      </span>
                    ))}
                  </p>
                  <FeatureIconComponent aria-hidden className="feature-icon" />
                </TiltGlare>
              </m.li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
