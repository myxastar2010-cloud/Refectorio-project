import { useEffect, useState } from 'react';
import { kiki } from '../../content/kiki.ru';
import { fill } from '../../lib/format';
import type { Busy } from './session';

/**
 * Kiki's «thinking» state (ТЗ 07 §10, the reference video): four accent dots in a 2×2 grid that shuffle into lines,
 * diagonals and clusters (CSS keyframes on transform only), a status line with a travelling shimmer (a band window and
 * an accent copy moving in opposite directions — transform only) and the elapsed seconds. Reduced motion → the dots
 * rest in the grid and pulse softly, no shimmer (kiki-chat.css).
 */
export function Thinking({ busy }: { readonly busy: Busy }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => {
      setSeconds(Math.floor((performance.now() - busy.startedAt) / 1000));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [busy.startedAt]);

  const label =
    busy.phase === 'reading' && busy.detail
      ? fill(kiki.status.reading, { site: busy.detail })
      : kiki.status[busy.phase];
  return (
    <div className="kiki-thinking" data-phase={busy.phase}>
      <span className="kiki-dots" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="kiki-status">
        {label}
        <span className="kiki-shine" aria-hidden>
          <span>{label}</span>
        </span>
      </span>
      {seconds >= 2 ? (
        <span className="kiki-elapsed">{fill(kiki.elapsed, { s: seconds })}</span>
      ) : null}
    </div>
  );
}
