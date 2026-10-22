import { IconApple, IconDoorExit } from '@tabler/icons-react';
import { m } from 'motion/react';
import { site } from '../content/site.ru';
import { useCalmMotion } from '../motion/hooks';
import { DURATION, EASE_IN_OUT, EASE_OUT_SOFT, QUIZ } from '../motion/tokens';
import { useWave } from '../motion/useWave';
import { WaveLayer } from '../motion/WaveHover';
import { heroFadeVariants, heroLiftVariants, type Phase } from './choreography';

type Props = {
  /** `quiz`: the header stays (logo) and its pill becomes «Выйти ×» (ТЗ §7.1). */
  readonly phase: Phase | 'quiz';
  readonly instant: boolean;
  /** Part 1 is scrolled (small screens): the header gets its own background over the content. */
  readonly scrolled: boolean;
  readonly onAbout: () => void;
  readonly onExit: () => void;
  /** «Цены»: opens its scene; focus returns here when the scene closes. */
  readonly pricingRef: (node: HTMLButtonElement | null) => void;
  readonly onPricing: () => void;
  /** Hover, focus or touch on «Цены»: fetch the scene and its pictures before the click. */
  readonly onPricingPrefetch: () => void;
};

/** «Цены», left of «О проекте»: the same glass pill; it steps aside in the quiz. */
function PricingPill({
  shown,
  calm,
  pricingRef,
  onPricing,
  onPrefetch,
}: {
  readonly shown: boolean;
  readonly calm: boolean;
  readonly pricingRef: (node: HTMLButtonElement | null) => void;
  readonly onPricing: () => void;
  readonly onPrefetch: () => void;
}) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  return (
    <m.button
      ref={(node: HTMLButtonElement | null) => {
        setHost(node);
        pricingRef(node);
      }}
      type="button"
      variants={heroFadeVariants(0, calm)}
      animate={shown ? 'shown' : 'hidden'}
      className="pricing-pill at box wave-host focus-ring"
      inert={!shown}
      aria-hidden={!shown || undefined}
      onClick={(event) => {
        act(event, onPricing);
      }}
      {...handlers}
      onPointerEnter={(event) => {
        onPrefetch();
        handlers.onPointerEnter(event);
      }}
      onPointerDown={(event) => {
        onPrefetch();
        handlers.onPointerDown(event);
      }}
      onFocus={(event) => {
        onPrefetch();
        handlers.onFocus(event);
      }}
    >
      <span className="wave-content">{site.hero.pricingButton}</span>
      <WaveLayer clipPath={clipPath} className="wave-layer--ink">
        {site.hero.pricingButton}
      </WaveLayer>
    </m.button>
  );
}

/** The pill label: «О проекте» ⇄ «Выйти» with a door cross-fade in the same pill (D-036: same size, no morph). */
function PillLabel({ quiz, calm }: { readonly quiz: boolean; readonly calm: boolean }) {
  const label = QUIZ.pillLabel;
  const fade = (shown: boolean) => ({
    opacity: shown ? 1 : 0,
    transform: shown ? 'translateY(0px)' : `translateY(${quiz ? -6 : 6}px)`,
    transition: calm
      ? { duration: DURATION.fade }
      : {
          duration: label.durationMs / 1000,
          ease: shown ? EASE_OUT_SOFT : EASE_IN_OUT,
          delay: shown ? label.delayMs / 1000 : 0,
        },
  });
  return (
    <span className="pill-labels">
      <m.span className="pill-label" initial={false} animate={fade(!quiz)} aria-hidden={quiz}>
        {site.hero.aboutButton}
      </m.span>
      <m.span
        className="pill-label pill-label--exit"
        initial={false}
        animate={fade(quiz)}
        aria-hidden={!quiz}
      >
        {site.quizShell.exit}
        <IconDoorExit aria-hidden className="pill-exit-icon" stroke={2} />
      </m.span>
    </span>
  );
}

/**
 * Logo and «О проекте» (ТЗ 6.2). It belongs to part 1 and leaves with it, but lives outside <main>, so it stays
 * the page's banner landmark. In the quiz the logo stays and the pill exits the quiz.
 */
export function SiteHeader({
  phase,
  instant,
  scrolled,
  onAbout,
  onExit,
  pricingRef,
  onPricing,
  onPricingPrefetch,
}: Props) {
  const calm = useCalmMotion();
  const quiz = phase === 'quiz';
  const motionPhase: Phase = phase === 'hidden' ? 'hidden' : 'shown';
  const hidden = phase === 'hidden';
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();

  return (
    <m.header
      className="site-header"
      inert={hidden}
      aria-hidden={hidden}
      data-scrolled={scrolled || undefined}
      data-mode={quiz ? 'quiz' : undefined}
      // The header only moves: the glass of «О проекте» must see the food behind it all the time (choreography.ts).
      variants={heroLiftVariants(0, calm)}
      animate={motionPhase}
      {...(instant ? { initial: false as const } : {})}
    >
      <m.div className="brand" variants={heroFadeVariants(0, calm)}>
        <IconApple aria-hidden className="brand-icon at box" stroke={2} data-food-avoid />
        <span className="brand-name at text-at" data-food-avoid>
          {site.brand.name}
        </span>
      </m.div>
      <PricingPill
        shown={phase === 'shown'}
        calm={calm}
        pricingRef={pricingRef}
        onPricing={onPricing}
        onPrefetch={onPricingPrefetch}
      />
      <m.button
        ref={setHost}
        type="button"
        variants={heroFadeVariants(0, calm)}
        className="about-pill at box wave-host focus-ring"
        aria-label={quiz ? site.quizShell.exitLabel : undefined}
        onClick={(event) => {
          act(event, quiz ? onExit : onAbout);
        }}
        {...handlers}
      >
        <span className="wave-content">
          <PillLabel quiz={quiz} calm={calm} />
        </span>
        <WaveLayer clipPath={clipPath} className="wave-layer--ink">
          <PillLabel quiz={quiz} calm={calm} />
        </WaveLayer>
      </m.button>
    </m.header>
  );
}
