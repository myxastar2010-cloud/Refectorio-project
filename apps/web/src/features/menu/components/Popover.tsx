import { AnimatePresence, m } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCalmMotion } from '../../../motion/hooks';
import { MENU } from '../../../motion/tokens';

type Props = {
  /** The button it belongs to; null — closed. */
  readonly anchor: HTMLElement | null;
  readonly label: string;
  /** `menu` — items with arrows and typeahead; `alertdialog` / `dialog` — free content. */
  readonly role: 'menu' | 'dialog' | 'alertdialog';
  readonly onClose: () => void;
  readonly children: ReactNode;
};

const MARGIN = 8;

/**
 * A small surface next to its button (ТЗ фаза 4 §6, §10, §14): it scales up from the button's side 0.96 → 1 with a fade
 * (≈ 140 ms). Esc or a press outside closes it and returns focus to the button. As a `menu` the arrows, Home/End and the
 * first letters move between the items; Tab leaves.
 */
export function Popover({ anchor, label, role, onClose, children }: Props) {
  return createPortal(
    <AnimatePresence>
      {anchor ? (
        <PopoverBody key="popover" anchor={anchor} label={label} role={role} onClose={onClose}>
          {children}
        </PopoverBody>
      ) : null}
    </AnimatePresence>,
    document.querySelector('.menu-scene') ?? document.body,
  );
}

function PopoverBody({
  anchor,
  label,
  role,
  onClose,
  children,
}: Props & { readonly anchor: HTMLElement }) {
  const calm = useCalmMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; origin: string } | null>(null);

  // Below the button, its left edge on the button's; flipped above or to the left near the window's edges.
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const a = anchor.getBoundingClientRect();
    const { width, height } = box.getBoundingClientRect();
    const below = a.bottom + MARGIN + height <= window.innerHeight;
    const left = Math.min(Math.max(MARGIN, a.left), window.innerWidth - width - MARGIN);
    const top = below ? a.bottom + MARGIN : Math.max(MARGIN, a.top - MARGIN - height);
    setPlace({
      left,
      top,
      origin: `${below ? 'top' : 'bottom'} ${left + width / 2 < a.left + a.width / 2 ? 'right' : 'left'}`,
    });
  }, [anchor]);

  useEffect(() => {
    const box = ref.current;
    const first = box?.querySelector<HTMLElement>(
      '[role="menuitem"]:not(:disabled), button:not(:disabled)',
    );
    first?.focus({ preventScroll: true });
    const close = () => {
      onClose();
      anchor.focus({ preventScroll: true });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!box?.contains(target) && !anchor.contains(target)) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchor, onClose]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (role !== 'menu') return;
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []),
    ];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      event.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') go(index + 1);
    else if (event.key === 'ArrowUp') go(index - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(items.length - 1);
    else if (event.key === 'Tab') onClose();
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      const found = items.findIndex(
        (item, i) => i > index && item.textContent.trim().toLowerCase().startsWith(letter),
      );
      const wrapped =
        found >= 0
          ? found
          : items.findIndex((item) => item.textContent.trim().toLowerCase().startsWith(letter));
      if (wrapped >= 0) go(wrapped);
    }
  };

  return (
    <m.div
      ref={ref}
      className="popover"
      role={role}
      aria-label={label}
      aria-modal={role === 'menu' ? undefined : false}
      style={
        place
          ? { left: place.left, top: place.top, transformOrigin: place.origin }
          : { visibility: 'hidden', left: 0, top: 0 }
      }
      onKeyDown={onKeyDown}
      initial={calm ? { opacity: 0 } : { opacity: 0, scale: MENU.popover.scaleFrom }}
      animate={{
        opacity: 1,
        scale: 1,
        transition: { duration: MENU.popover.durationS, ease: [0.16, 1, 0.3, 1] },
      }}
      exit={{
        opacity: 0,
        scale: calm ? 1 : MENU.popover.scaleFrom,
        transition: { duration: MENU.popover.durationS * 0.8 },
      }}
    >
      {children}
    </m.div>
  );
}
