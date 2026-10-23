import { useRef, type KeyboardEvent } from 'react';
import { BILLING_PERIODS, type BillingPeriod } from '../../content/constants';
import { site } from '../../content/site.ru';

type Props = {
  readonly period: BillingPeriod;
  readonly onChange: (period: BillingPeriod) => void;
};

const STEP: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * «Месяц» / «Год −44%»: a radio group (arrows move the choice, as in any radio group — they do not switch scenes
 * here). The black pill slides under the chosen label (pricing.css).
 */
export function PeriodSwitch({ period, onChange }: Props) {
  const { periods, periodsLabel } = site.pricing;
  const buttons = useRef(new Map<BillingPeriod, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEP[event.key];
    if (!step) return;
    event.preventDefault();
    const at = BILLING_PERIODS.indexOf(period);
    const next = BILLING_PERIODS[(at + step + BILLING_PERIODS.length) % BILLING_PERIODS.length];
    if (!next) return;
    onChange(next);
    buttons.current.get(next)?.focus();
  };

  return (
    <div
      className="period-switch"
      role="radiogroup"
      aria-label={periodsLabel}
      data-period={period}
      onKeyDown={onKeyDown}
    >
      <span className="period-thumb" aria-hidden />
      {BILLING_PERIODS.map((id) => (
        <button
          key={id}
          ref={(node) => {
            if (node) buttons.current.set(id, node);
            else buttons.current.delete(id);
          }}
          type="button"
          role="radio"
          aria-checked={period === id}
          tabIndex={period === id ? 0 : -1}
          className="period-option"
          onClick={() => {
            onChange(id);
          }}
        >
          {periods[id]}
          {id === 'year' && <span className="period-discount">{periods.yearDiscount}</span>}
        </button>
      ))}
    </div>
  );
}
