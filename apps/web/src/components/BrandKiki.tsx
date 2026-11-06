import { useEffect, useState } from 'react';
import { site } from '../content/site.ru';
import '../styles/brand-kiki.css';
import { BrandLogo } from './BrandLogo';

/** How long one line stays before the next one (and her face with it). */
const SAY_MS = 5200;

type Props = {
  /** Part 1 is on screen: only then she speaks. */
  readonly active: boolean;
  /** Reduced motion: she keeps her first line, and it does not fade. */
  readonly calm: boolean;
};

/**
 * The logo of the header (D-103): Kiki says her lines in a bubble under herself, and her face follows the mood of each —
 * the point the product is built around: she reacts to what the person does. Decorative: the Kiki card and the lead say
 * the same. The bubble is shown on wide screens only (brand-kiki.css); a line fades in and out softly, with no pop.
 */
export function BrandKiki({ active, calm }: Props) {
  const { lines } = site.hero.kiki;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (calm || !active) return;
    const timer = window.setInterval(() => {
      setTick((previous) => previous + 1);
    }, SAY_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [calm, active]);

  const line = lines[tick % lines.length] ?? lines[0];

  return (
    <>
      <BrandLogo mood={line.mood} />
      <span
        className="brand-bubble"
        aria-hidden
        data-on={active || undefined}
        data-calm={calm || undefined}
      >
        {/* A new key restarts the fade; only the very first line waits for the header to settle. */}
        <span className="brand-bubble-line" key={tick} data-first={tick === 0 || undefined}>
          {line.text}
        </span>
      </span>
    </>
  );
}
