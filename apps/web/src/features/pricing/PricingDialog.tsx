import '../../styles/pricing.css';

import { IconCheck, IconX } from '@tabler/icons-react';
import clsx from 'clsx';
import { AnimatePresence, m, usePresence } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { PlanId, SiteContent } from '../../content/schema';
import { site } from '../../content/site.ru';
import { focusQuietly } from '../../lib/quietFocus';
import { revealMotion, useCornerMorph } from '../../motion/cornerMorph';
import { useCalmMotion } from '../../motion/hooks';
import { DURATION, MORPH } from '../../motion/tokens';
import { useWave } from '../../motion/useWave';
import { WaveLayer } from '../../motion/WaveHover';

type Props = {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The «Цены» pill the card grows out of and returns into. */
  readonly anchorRef: RefObject<HTMLElement | null>;
  /** The card is back on the pill. */
  readonly onLanded: () => void;
  /** A plan's button was pressed: «Начать бесплатно» starts the quiz, the paid ones say there is no payment yet. */
  readonly onChoose: (plan: PlanId) => void;
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function PlanButton({
  plan,
  label,
  onChoose,
}: {
  readonly plan: PlanId;
  readonly label: string;
  readonly onChoose: (plan: PlanId) => void;
}) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  const accent = plan === 'premium';
  return (
    <button
      ref={setHost}
      type="button"
      className={clsx('pricing-action wave-host focus-ring', accent && 'pricing-action--accent')}
      onClick={(event) => {
        act(event, () => {
          onChoose(plan);
        });
      }}
      {...handlers}
    >
      <span className="wave-content">{label}</span>
      <WaveLayer clipPath={clipPath} className="wave-layer--ink">
        {label}
      </WaveLayer>
    </button>
  );
}

/** The plans side by side (wide screens) or one at a time with a switcher (phones, tablets, low windows). */
function Plans({
  reveal,
  onChoose,
}: {
  readonly reveal: (index: number) => ReturnType<typeof revealMotion>;
  readonly onChoose: (plan: PlanId) => void;
}) {
  const { plansLabel } = site.pricing;
  // Widened to the schema's type: a plan may or may not have a badge and a second price line.
  const plans: SiteContent['pricing']['plans'] = site.pricing.plans;
  const [shown, setShown] = useState<PlanId>('premium');
  return (
    <>
      <m.div className="pricing-switch" role="group" aria-label={plansLabel} {...reveal(1)}>
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            aria-pressed={shown === plan.id}
            aria-controls={`pricing-plan-${plan.id}`}
            className={clsx('pricing-switch-option focus-ring', shown === plan.id && 'is-selected')}
            onClick={() => {
              setShown(plan.id);
            }}
          >
            {plan.name}
          </button>
        ))}
      </m.div>
      <ul className="pricing-plans" aria-label={plansLabel}>
        {plans.map((plan, index) => (
          <m.li
            key={plan.id}
            id={`pricing-plan-${plan.id}`}
            className={clsx('pricing-plan', `pricing-plan--${plan.id}`)}
            data-shown={shown === plan.id || undefined}
            aria-labelledby={`pricing-name-${plan.id}`}
            {...reveal(index + 1)}
          >
            <div className="pricing-plan-head">
              <h3 id={`pricing-name-${plan.id}`} className="pricing-plan-name">
                {plan.name}
              </h3>
              {plan.badge ? <span className="pricing-badge">{plan.badge}</span> : null}
            </div>
            <p className="pricing-price">
              <span className="pricing-price-value">{plan.price}</span>
              <span className="pricing-price-period">{plan.period}</span>
            </p>
            {plan.note ? <p className="pricing-price-note">{plan.note}</p> : null}
            <p className="pricing-tagline">{plan.tagline}</p>
            <ul className="pricing-features">
              {plan.features.map((feature) => (
                <li key={feature} className="pricing-feature">
                  <IconCheck aria-hidden className="pricing-check" stroke={2.5} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <PlanButton plan={plan.id} label={plan.action} onChoose={onChoose} />
          </m.li>
        ))}
      </ul>
    </>
  );
}

function DialogBody({ onClose, anchorRef, onLanded, onChoose }: Omit<Props, 'open'>) {
  const [present, safeToRemove] = usePresence();
  const calm = useCalmMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const close = useWave<HTMLButtonElement>();
  const [revealed, setRevealed] = useState(false);
  const { pricing } = site;

  useCornerMorph({
    surface: surfaceRef,
    anchor: anchorRef,
    present,
    calm,
    fadeBelow: MORPH.labelFadeBelow,
    onReveal: () => {
      setRevealed(true);
    },
    onLanded,
    onDone: () => {
      safeToRemove?.();
    },
  });

  useEffect(() => {
    focusQuietly(closeRef.current);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ].filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const reveal = (index: number) => revealMotion(index, revealed, calm);

  return (
    // While the card flies back, the dialog is already gone for keyboards and screen readers.
    <div className="pricing-root" inert={!present}>
      <m.div
        className="pricing-scrim"
        aria-hidden
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: DURATION.scrim } }}
        exit={{ opacity: 0, transition: { duration: DURATION.scrimOut } }}
      />
      <div
        ref={dialogRef}
        className="pricing-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-title"
        onKeyDown={onKeyDown}
      >
        <div ref={surfaceRef} className="pricing-surface" aria-hidden />
        <div className="pricing-body">
          <m.div className="pricing-head" {...reveal(0)}>
            <h2 id="pricing-title" className="pricing-title">
              {pricing.title}
            </h2>
            <p className="pricing-lead">{pricing.lead}</p>
          </m.div>
          <Plans reveal={reveal} onChoose={onChoose} />
          <m.div className="pricing-close-slot" {...reveal(4)}>
            <button
              ref={(node) => {
                closeRef.current = node;
                close.setHost(node);
              }}
              type="button"
              className="pricing-close wave-host focus-ring"
              aria-label={pricing.close}
              onClick={(event) => {
                close.act(event, onClose);
              }}
              {...close.handlers}
            >
              <IconX aria-hidden className="pricing-close-icon" stroke={2} />
              <WaveLayer clipPath={close.clipPath} className="wave-layer--ink">
                <IconX aria-hidden className="pricing-close-icon" stroke={2} />
              </WaveLayer>
            </button>
          </m.div>
        </div>
      </div>
    </div>
  );
}

/**
 * «Цены» (the team's request, 17.10): the plans of the business model on a card that grows out of the «Цены» pill
 * with the team card's corner morph; the page behind dims and blurs (App marks it), the content comes in at ≈ 70 %
 * of the shape, closing is the reverse and 1.5× faster. A dialog: focus trap, Esc, click outside, focus return.
 * Nothing can be bought: a paid plan's button says so (App shows the message).
 */
export function PricingDialog({ open, onClose, anchorRef, onLanded, onChoose }: Props) {
  return (
    <AnimatePresence>
      {open ? (
        <DialogBody
          key="pricing"
          onClose={onClose}
          anchorRef={anchorRef}
          onLanded={onLanded}
          onChoose={onChoose}
        />
      ) : null}
    </AnimatePresence>
  );
}
