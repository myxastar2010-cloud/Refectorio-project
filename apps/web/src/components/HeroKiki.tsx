import { m, type MotionProps } from 'motion/react';
import { useEffect, useState } from 'react';
import { site } from '../content/site.ru';
import '../styles/hero-kiki.css';
import { Kiki } from './Kiki';

/** How long she says one thing before the next (and her mood with it). */
const SAY_MS = 3800;

type Props = {
  /** The cascade of part 1 (heroVariants): she comes and goes with the cards. */
  readonly motion: MotionProps;
  /** Part 1 is on screen: only then the lines change. */
  readonly active: boolean;
  /** Reduced motion: she keeps her first line and does not float. */
  readonly calm: boolean;
};

/**
 * Kiki on the first screen (D-102): she stands by the girl's desk and says a line; her mood follows the line — the point
 * the product is built around: she reacts to what the person does. Decorative: the Kiki card and the lead say the same.
 */
export function HeroKiki({ motion, active, calm }: Props) {
  const { kiki } = site.hero;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (calm || !active) return;
    const timer = window.setInterval(() => {
      setIndex((previous) => (previous + 1) % kiki.lines.length);
    }, SAY_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [calm, active, kiki.lines.length]);

  const line = kiki.lines[index] ?? kiki.lines[0];

  return (
    <m.div className="hero-kiki" aria-hidden data-calm={calm || undefined} {...motion}>
      <div className="hero-kiki-art">
        <p className="hero-kiki-bubble" key={index}>
          {line.text}
        </p>
        <Kiki mood={line.mood} level={2} label={kiki.label} decorative />
      </div>
    </m.div>
  );
}
