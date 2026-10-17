import { AnimatePresence, m } from 'motion/react';
import { DURATION, EASE_OUT_EXPO } from '../motion/tokens';

/** `id` changes with every new message: the same text twice in a row keeps the message up for another while. */
export type ToastMessage = { readonly text: string; readonly id: number };

type Props = { readonly message: ToastMessage | null };

/** Small non-modal message (role="status"): announced by screen readers, never steals focus. */
export function Toast({ message }: Props) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {/* One at a time: the next message waits for the previous one to leave; the same text again just stays. */}
      <AnimatePresence mode="wait">
        {message && (
          <m.p
            key={message.text}
            className="toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: DURATION.toast, ease: EASE_OUT_EXPO },
            }}
            exit={{ opacity: 0, y: 8, transition: { duration: DURATION.micro } }}
          >
            {message.text}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  );
}
