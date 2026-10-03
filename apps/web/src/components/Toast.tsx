import { AnimatePresence, m } from 'motion/react';
import { DURATION, EASE_OUT_EXPO } from '../motion/tokens';

type Props = { readonly message: string | null };

/** Small non-modal message (role="status"): announced by screen readers, never steals focus. */
export function Toast({ message }: Props) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      <AnimatePresence>
        {message && (
          <m.p
            key={message}
            className="toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: DURATION.toast, ease: EASE_OUT_EXPO },
            }}
            exit={{ opacity: 0, y: 8, transition: { duration: DURATION.micro } }}
          >
            {message}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}
