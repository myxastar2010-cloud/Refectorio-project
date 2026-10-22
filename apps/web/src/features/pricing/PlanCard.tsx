import { IconCheck, IconX } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { Lines } from '../../components/Lines';
import type { BillingPeriod, SiteContent } from '../../content/schema';
import { site } from '../../content/site.ru';
import { focusQuietly } from '../../lib/quietFocus';
import { useCalmMotion } from '../../motion/hooks';
import { PRICING } from '../../motion/tokens';
import { aboutCardVariants, type Phase } from '../../scenes/choreography';
import type { CardPicture } from './pictures';
import {
  bodyVariants,
  extraItemVariants,
  extraVariants,
  lessButtonVariants,
  openPictureVariants,
  priceMotion,
  ringStrokeVariants,
  ringVariants,
} from './planMotion';

type Plan = SiteContent['pricing']['plans'][number];

/** Premium's «Ещё...»: the rest of its list on the fully blurred copy of its picture. */
export type PlanMore = {
  readonly open: boolean;
  readonly picture: CardPicture | null;
  readonly onToggle: (open: boolean) => void;
};

type Props = {
  readonly plan: Plan;
  /** Place in the scene's cascade (the frame is 0). */
  readonly index: number;
  readonly phase: Phase;
  readonly instant: boolean;
  readonly period: BillingPeriod;
  readonly picture: CardPicture | null;
  readonly onChoose: () => void;
  readonly more?: PlanMore | undefined;
};

/**
 * The hover ring, a little off the card (mockup units: the card is 407 × 544, the ring 8 off its edge, 3 thick). Two
 * halves from the top centre to the bottom centre, so it draws itself both ways round at once.
 */
const RING = { width: 429, height: 566, inset: 1.5, radius: 71.5 } as const;
const ringHalf = (side: 1 | -1) => {
  const { width, height, inset, radius } = RING;
  const mid = width / 2;
  const edge = side === 1 ? width - inset : inset;
  const corner = side === 1 ? width - inset - radius : inset + radius;
  const sweep = side === 1 ? 1 : 0;
  return [
    `M ${String(mid)} ${String(inset)}`,
    `H ${String(corner)}`,
    `A ${String(radius)} ${String(radius)} 0 0 ${String(sweep)} ${String(edge)} ${String(inset + radius)}`,
    `V ${String(height - inset - radius)}`,
    `A ${String(radius)} ${String(radius)} 0 0 ${String(sweep)} ${String(corner)} ${String(height - inset)}`,
    `H ${String(mid)}`,
  ].join(' ');
};
const RING_PATHS = [ringHalf(1), ringHalf(-1)] as const;

function PlanRing({ shown, calm }: { readonly shown: boolean; readonly calm: boolean }) {
  return (
    <m.div
      className="plan-ring"
      aria-hidden
      initial={{ opacity: 0, transform: `scale(${String(PRICING.ring.fromScale)})` }}
      animate={shown ? 'shown' : 'hidden'}
      variants={ringVariants(calm)}
    >
      <svg viewBox={`0 0 ${String(RING.width)} ${String(RING.height)}`} fill="none">
        {RING_PATHS.map((d) => (
          <m.path key={d} d={d} initial={{ pathLength: 0 }} variants={ringStrokeVariants(calm)} />
        ))}
      </svg>
    </m.div>
  );
}

function Picture({ picture }: { readonly picture: CardPicture | null }) {
  if (!picture) return null;
  return (
    <picture>
      <source type="image/avif" srcSet={picture.avif} />
      <img className="plan-picture" src={picture.webp} alt="" decoding="async" draggable={false} />
    </picture>
  );
}

function Features({ features }: { readonly features: readonly (readonly string[])[] }) {
  return features.map((lines) => (
    <li key={lines.join(' ')} className="plan-feature">
      <IconCheck aria-hidden className="plan-check" stroke={2.5} />
      <span>
        <Lines lines={lines} />
      </span>
    </li>
  ));
}

/**
 * A plan card (the team's mockups): its picture, name, price and list. Hovering it — or a keyboard focus on it — draws
 * a ring round it; a press chooses the plan (nothing can be bought yet: the page says so). Premium opens the rest of its
 * list with «Ещё...».
 */
export function PlanCard({ plan, index, phase, instant, period, picture, onChoose, more }: Props) {
  const calm = useCalmMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = more?.open ?? false;
  const price = plan.prices[period];
  const priceSwap = priceMotion(calm);
  const state = open ? 'away' : 'here';
  const moreRef = useRef<HTMLButtonElement>(null);
  const lessRef = useRef<HTMLButtonElement>(null);

  // Focus follows «Ещё...»: to the card's × when it opens, back to «Ещё...» when it closes.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    focusQuietly(open ? lessRef.current : moreRef.current);
  }, [open]);

  const hover = (event: PointerEvent, inside: boolean) => {
    if (event.pointerType !== 'touch') setHovered(inside);
  };
  const focus = (event: FocusEvent<HTMLButtonElement>) => {
    setFocused(event.currentTarget.matches(':focus-visible'));
  };

  return (
    <m.li
      className="plan"
      data-plan={plan.id}
      data-open={open || undefined}
      variants={aboutCardVariants(index, PRICING.cards, calm)}
      initial={instant ? false : 'hidden'}
      animate={phase}
      onPointerEnter={(event) => {
        hover(event, true);
      }}
      onPointerLeave={(event) => {
        hover(event, false);
      }}
    >
      <div className="plan-surface">
        <Picture picture={picture} />
        {more && (
          <m.div
            className="plan-picture-open"
            initial={false}
            animate={state}
            variants={openPictureVariants(calm)}
          >
            <Picture picture={more.picture} />
          </m.div>
        )}
      </div>

      <PlanRing shown={(hovered || focused) && !open} calm={calm} />

      <button
        type="button"
        className="plan-choose"
        aria-label={site.pricing.choose.replace('{name}', plan.name)}
        hidden={open}
        onClick={onChoose}
        onFocus={focus}
        onBlur={() => {
          setFocused(false);
        }}
      />

      <m.div
        className="plan-body"
        initial={false}
        animate={state}
        variants={bodyVariants(calm)}
        inert={open}
      >
        <h3 className="plan-name">{plan.name}</h3>
        <p className="plan-tagline">{plan.tagline}</p>
        <p className="plan-price">
          <AnimatePresence initial={false}>
            <m.span key={price.amount} className="plan-price-value" {...priceSwap}>
              <span className="plan-amount">{price.amount}</span>
              <span className="plan-per">{price.per}</span>
            </m.span>
          </AnimatePresence>
        </p>
        <ul className="plan-features">
          <Features features={plan.features} />
        </ul>
        {more && (
          <button
            ref={moreRef}
            type="button"
            className="plan-more focus-ring-inverse"
            aria-label={site.pricing.more.open}
            aria-expanded={open}
            aria-controls="plan-premium-more"
            onClick={() => {
              more.onToggle(true);
            }}
          >
            {site.pricing.more.label}
          </button>
        )}
      </m.div>

      {more && (
        <m.div
          id="plan-premium-more"
          className="plan-extra"
          initial={false}
          animate={state}
          variants={extraVariants(calm)}
          inert={!open}
        >
          <m.button
            ref={lessRef}
            type="button"
            className="plan-less focus-ring-inverse"
            aria-label={site.pricing.more.close}
            variants={lessButtonVariants(calm)}
            onClick={() => {
              more.onToggle(false);
            }}
          >
            <IconX aria-hidden stroke={2} />
          </m.button>
          <ul className="plan-features plan-features--extra">
            {site.pricing.more.features.map((lines) => (
              <m.li
                key={lines.join(' ')}
                className="plan-feature"
                variants={extraItemVariants(calm)}
              >
                <IconCheck aria-hidden className="plan-check" stroke={2.5} />
                <span>
                  <Lines lines={lines} />
                </span>
              </m.li>
            ))}
          </ul>
        </m.div>
      )}
    </m.li>
  );
}
