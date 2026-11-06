import clsx from 'clsx';
import { memo } from 'react';
import {
  IconBoltFilled,
  IconListDetails,
  IconMugFilled,
  IconTrophyFilled,
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
import '../styles/hero-kiki.css';
import { Kiki } from '../components/Kiki';
import { Lines } from '../components/Lines';

/** Kiki's card draws her face instead of an icon (below). */
const FEATURE_ICONS: Record<Exclude<FeatureIcon, 'kiki'>, Icon> = {
  listDetails: IconListDetails, // Its squares are filled by CSS, as on the mockup: Tabler has no such filled icon.
  mug: IconMugFilled,
  bolt: IconBoltFilled,
  trophy: IconTrophyFilled,
};

/** A feature card's icon from Tabler (Kiki's card has her own face). */
function CardGlyph({ icon, className }: { icon: keyof typeof FEATURE_ICONS; className: string }) {
  const Glyph = FEATURE_ICONS[icon];
  return <Glyph aria-hidden className={className} />;
}

type Props = {
  readonly phase: Phase;
  readonly instant: boolean;
  /** The section itself: on small screens part 1 scrolls when it does not fit (useSceneInput reads it). */
  readonly scrollerRef: Ref<HTMLElement>;
  readonly onScrolled: (scrolled: boolean) => void;
  readonly onCreateMenu: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** A menu is stored here: the CTA opens it instead of the quiz. */
  readonly hasMenu: boolean;
  /** Hover, focus or touch on «Создать меню» starts loading the quiz chunk. */
  readonly onPrefetch: () => void;
  /** The empty box that keeps her place in the layout (HeroGirl draws her under the scenes). */
  readonly girlSlotRef: Ref<HTMLDivElement>;
};

/**
 * Part 1: heading, lead, «Создать меню», the girl's place and the five feature cards (ТЗ 6.2; the cards are not shown on
 * phones); the header is SiteHeader (Kiki is its logo and speaks there, D-103).
 */
/* memo: a scene change re-rendered every scene, the hidden ones too (stage-3 performance audit, F3). */
export const HeroScene = memo(function HeroScene({
  phase,
  instant,
  scrollerRef,
  onScrolled,
  onCreateMenu,
  hasMenu,
  onPrefetch,
  girlSlotRef,
}: Props) {
  const calm = useCalmMotion();
  const hidden = phase === 'hidden';
  const cta = hasMenu ? site.hero.ctaOpen : site.hero.cta;
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
      <m.h1
        id="hero-title"
        className="hero-title at text-at"
        aria-label={site.hero.titleSpoken}
        data-food-avoid
        {...motionProps(1)}
      >
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
            href={cta.href}
            variants={heroFadeVariants(2, calm)}
            className="cta wave-host"
            onClick={(event) => {
              afterCtaWave(event, onCreateMenu);
            }}
            {...ctaWave}
            onPointerEnter={(event) => {
              onPrefetch();
              ctaWave.onPointerEnter(event);
            }}
            onPointerDown={(event) => {
              onPrefetch();
              ctaWave.onPointerDown(event);
            }}
            onFocus={(event) => {
              onPrefetch();
              ctaWave.onFocus(event);
            }}
          >
            <span className="wave-content">
              <span>{cta.label}</span>
            </span>
            <WaveLayer clipPath={ctaClip} className="wave-layer--ink">
              <span>{cta.label}</span>
            </WaveLayer>
          </m.a>
        </TiltGlare>
      </m.div>

      <div ref={girlSlotRef} className="hero-girl-slot at box" aria-hidden />

      <ul className="features" aria-label={site.hero.featuresLabel}>
        {site.hero.features.map((feature, index) => {
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
                {feature.icon === 'kiki' ? (
                  <Kiki
                    decorative
                    mood="glow"
                    level={2}
                    label={site.hero.kiki.label}
                    className="feature-icon"
                  />
                ) : (
                  <CardGlyph
                    icon={feature.icon}
                    className={clsx(
                      'feature-icon',
                      feature.icon === 'listDetails' && 'feature-icon--list',
                    )}
                  />
                )}
              </TiltGlare>
            </m.li>
          );
        })}
      </ul>
    </section>
  );
});
