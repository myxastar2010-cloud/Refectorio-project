import '../../styles/pricing.css';

import { IconX } from '@tabler/icons-react';
import { m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { BillingPeriod, PlanId } from '../../content/schema';
import { site } from '../../content/site.ru';
import { focusQuietly } from '../../lib/quietFocus';
import { useCalmMotion } from '../../motion/hooks';
import { PRICING } from '../../motion/tokens';
import { aboutCardVariants, aboutTitleVariants, type Phase } from '../../scenes/choreography';
import { PeriodSwitch } from './PeriodSwitch';
import type { PlanPictures } from './pictures';
import { PlanCard } from './PlanCard';

type Props = {
  readonly phase: Phase;
  readonly instant: boolean;
  /** This visit's card pictures (another pair every visit); null until chosen. */
  readonly pictures: PlanPictures | null;
  readonly onClose: () => void;
  readonly onChoose: (plan: PlanId) => void;
};

/**
 * «Цены» (#pricing, the team's mockups «цены дизайн»): the title, and a frame with the heading, the month / year switch
 * and the two plans. It comes and goes exactly like part 2 (choreography.ts: the title, the frame, then the plans); it
 * is reached only by the «Цены» button and left by its × or a scroll up (useSceneInput). Escape closes Premium's
 * «Ещё...» first, then the scene.
 */
export function PricingScene({ phase, instant, pictures, onClose, onChoose }: Props) {
  const calm = useCalmMotion();
  const hidden = phase === 'hidden';
  const text = site.pricing;
  const [free, premium] = text.plans;
  const [period, setPeriod] = useState<BillingPeriod>('month');
  const [moreOpen, setMoreOpen] = useState(false);
  // The first visit mounts the scene already shown: it must still come in from «hidden», like part 2.
  const initial = instant ? ({ initial: false } as const) : ({ initial: 'hidden' } as const);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Every visit starts as on the mockup: a month, Premium closed (a visit brings new pictures).
  const [visit, setVisit] = useState(pictures);
  if (visit !== pictures) {
    setVisit(pictures);
    setPeriod('month');
    setMoreOpen(false);
  }

  // Opening moves focus to the title, like part 2 (a direct visit leaves it where the browser puts it).
  useEffect(() => {
    if (!hidden && !instant) focusQuietly(titleRef.current);
  }, [hidden, instant]);

  useEffect(() => {
    if (hidden) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (moreOpen) setMoreOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [hidden, moreOpen, onClose]);

  return (
    <section
      className="scene scene--pricing"
      aria-labelledby="pricing-title"
      inert={hidden}
      aria-hidden={hidden}
      data-scene-active={!hidden}
    >
      <m.h2
        ref={titleRef}
        id="pricing-title"
        className="pricing-title"
        tabIndex={-1}
        variants={aboutTitleVariants(calm)}
        {...initial}
        animate={phase}
      >
        {text.title}
      </m.h2>

      <div className="pricing-board">
        <m.div
          className="pricing-frame"
          aria-hidden
          variants={aboutCardVariants(0, PRICING.cards, calm)}
          {...initial}
          animate={phase}
        />
        <m.div
          className="pricing-head"
          variants={aboutCardVariants(0, PRICING.cards, calm)}
          {...initial}
          animate={phase}
        >
          <h3 className="pricing-heading">{text.heading}</h3>
          <p className="pricing-lead">{text.lead}</p>
          <PeriodSwitch period={period} onChange={setPeriod} />
        </m.div>
        <m.button
          type="button"
          className="pricing-close"
          aria-label={text.close}
          variants={aboutCardVariants(0, PRICING.cards, calm)}
          {...initial}
          animate={phase}
          onClick={onClose}
        >
          <IconX aria-hidden stroke={2} />
        </m.button>
        <ul className="pricing-plans" aria-label={text.plansLabel}>
          <PlanCard
            plan={free}
            index={1}
            phase={phase}
            instant={instant}
            period={period}
            picture={pictures?.free ?? null}
            onChoose={() => {
              onChoose(free.id);
            }}
          />
          <PlanCard
            plan={premium}
            index={2}
            phase={phase}
            instant={instant}
            period={period}
            picture={pictures?.premium ?? null}
            onChoose={() => {
              onChoose(premium.id);
            }}
            more={{ open: moreOpen, picture: pictures?.premiumOpen ?? null, onToggle: setMoreOpen }}
          />
        </ul>
      </div>
    </section>
  );
}
