import { AnimatePresence, m } from 'motion/react';
import { DURATION, EASE_OUT_EXPO } from '../motion/tokens';

/** A button in the toast: «Отменить» after a change that can be undone. */
export type ToastAction = { readonly label: string; readonly run: () => void };

/** `id` changes with every new message: the same text twice in a row keeps the message up for another while. */
export type ToastMessage = {
  readonly text: string;
  readonly id: number;
  readonly action?: ToastAction | undefined;
};

type Props = {
  readonly message: ToastMessage | null;
  /** The action was taken: the toast goes. */
  readonly onAction?: () => void;
};

/** Small non-modal message (role="status"): announced by screen readers, never steals focus. */
export function Toast({ message, onAction }: Props) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {/* One at a time: the next message waits for the previous one to leave; the same text again just stays. */}
      <AnimatePresence mode="wait">
        {message && (
          <m.div
            key={`${message.text}:${message.action ? String(message.id) : ''}`}
            className="toast"
            data-action={message.action ? true : undefined}
            initial={{ opacity: 0, y: 16 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: DURATION.toast, ease: EASE_OUT_EXPO },
            }}
            exit={{ opacity: 0, y: 8, transition: { duration: DURATION.micro } }}
          >
            <p>{message.text}</p>
            {message.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  message.action?.run();
                  onAction?.();
                }}
              >
                {message.action.label}
              </button>
            ) : null}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
