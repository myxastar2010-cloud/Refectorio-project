import { IconChevronRight, type Icon } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useModal } from '../../../components/useModal';
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
  readonly className?: string | undefined;
};

const MARGIN = 8;
const SUB_GAP = 6;
/** Items of a menu: plain, checkbox and radio items (`menuitem`, `menuitemcheckbox`, `menuitemradio`). */
const FOCUSABLE_ITEM = '[role^="menuitem"]:not(:disabled)';

/** An open submenu tells its popover how to close it: Esc closes the submenu first, then the menu. */
const PopoverContext = createContext<{ setSub: (close: (() => void) | null) => void } | null>(null);

/**
 * Arrows, Home/End and first letters among the items of one menu (not of the submenus inside it). Returns true when the
 * key was a menu key.
 */
function menuKeys(event: React.KeyboardEvent, menu: HTMLElement): boolean {
  const items = [...menu.querySelectorAll<HTMLElement>(FOCUSABLE_ITEM)].filter(
    (item) => item.closest('[role="menu"]') === menu,
  );
  const index = items.indexOf(document.activeElement as HTMLElement);
  const go = (i: number) => {
    event.preventDefault();
    items[(i + items.length) % items.length]?.focus();
  };
  if (event.key === 'ArrowDown') go(index + 1);
  else if (event.key === 'ArrowUp') go(index - 1);
  else if (event.key === 'Home') go(0);
  else if (event.key === 'End') go(items.length - 1);
  else if (event.key.length === 1 && /\S/.test(event.key)) {
    const letter = event.key.toLowerCase();
    const starts = (item: HTMLElement) => item.textContent.trim().toLowerCase().startsWith(letter);
    const found = items.findIndex((item, i) => i > index && starts(item));
    const wrapped = found >= 0 ? found : items.findIndex(starts);
    if (wrapped >= 0) go(wrapped);
  } else return false;
  return true;
}

/**
 * A small surface next to its button (ТЗ фаза 4 §6, §10, §14): it scales up from the button's side 0.96 → 1 with a fade
 * (≈ 140 ms). Esc or a press outside closes it and returns focus to the button. As a `menu` the arrows, Home/End and the
 * first letters move between the items; Tab leaves; a `Submenu` inside opens to the side.
 */
export function Popover({ anchor, label, role, onClose, children, className }: Props) {
  return createPortal(
    <AnimatePresence>
      {anchor ? (
        <PopoverBody
          key="popover"
          anchor={anchor}
          label={label}
          role={role}
          onClose={onClose}
          className={className}
        >
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
  className,
}: Props & { readonly anchor: HTMLElement }) {
  const calm = useCalmMotion();
  const ref = useRef<HTMLDivElement>(null);
  const sub = useRef<(() => void) | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; origin: string } | null>(null);
  const context = useMemo(
    () => ({
      setSub: (close: (() => void) | null) => {
        sub.current = close;
      },
    }),
    [],
  );

  // Below the button, its left edge on the button's; flipped above or to the left near the window's edges. Content that
  // arrives later (a list after loading) places it again.
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    const placeIt = () => {
      const a = anchor.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = box;
      const below = a.bottom + MARGIN + height <= window.innerHeight;
      const left = Math.min(Math.max(MARGIN, a.left), window.innerWidth - width - MARGIN);
      const top = below
        ? a.bottom + MARGIN
        : Math.max(MARGIN, Math.min(a.top - MARGIN - height, window.innerHeight - MARGIN - height));
      setPlace({
        left,
        top,
        origin: `${below ? 'top' : 'bottom'} ${left + width / 2 < a.left + a.width / 2 ? 'right' : 'left'}`,
      });
    };
    placeIt();
    const observer = new ResizeObserver(placeIt);
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, [anchor]);

  // Hidden until placed, and a hidden element takes no focus: the first item gets it once the popover shows.
  const placed = place !== null;
  // A confirmation (alertdialog) is modal: focus stays in it, the page behind is inert, focus returns to the button.
  useModal({
    open: role === 'alertdialog' && placed,
    containerRef: ref,
    onClose,
    returnFocusTo: anchor,
    background: '.menu-app, .menu-kiki-fab',
    fallbackFocusId: 'menu-title',
  });
  // A menu or a small dialog is not: Tab out of it closes it (it never lingers behind the focus).
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (role === 'alertdialog' || !(next instanceof Node)) return;
    if (!ref.current?.contains(next) && !anchor.contains(next)) onClose();
  };
  useEffect(() => {
    if (!placed) return;
    ref.current
      ?.querySelector<HTMLElement>(`${FOCUSABLE_ITEM}, button:not(:disabled)`)
      ?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    const box = ref.current;
    const close = () => {
      onClose();
      anchor.focus({ preventScroll: true });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (sub.current) sub.current();
      else close();
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
    if (role !== 'menu' || !ref.current) return;
    if (event.key === 'Tab') onClose();
    else menuKeys(event, ref.current);
  };

  return (
    <PopoverContext.Provider value={context}>
      <m.div
        ref={ref}
        className={className ? `popover ${className}` : 'popover'}
        role={role}
        aria-label={label}
        aria-modal={role === 'menu' ? undefined : role === 'alertdialog'}
        style={
          place
            ? { left: place.left, top: place.top, transformOrigin: place.origin }
            : { visibility: 'hidden', left: 0, top: 0 }
        }
        onKeyDown={onKeyDown}
        onBlur={onBlur}
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
    </PopoverContext.Provider>
  );
}

type SubmenuProps = {
  readonly label: string;
  readonly icon: Icon;
  readonly children: ReactNode;
};

type SubPlace = { readonly left: number; readonly top: number; readonly side: 1 | -1 | 0 };

/**
 * An item that opens a menu to its side (ТЗ фаза 4 §10): on hover (with intent), →, Enter or a tap; ← or Esc close it
 * and return to the item. It flips to the left near the window's edge and lies over the menu on a narrow screen. The
 * panel lives inside the parent popover, so a press in it is never «outside».
 */
export function Submenu({ label, icon: ItemIcon, children }: SubmenuProps) {
  const calm = useCalmMotion();
  const parent = useContext(PopoverContext);
  const [open, setOpen] = useState<'pointer' | 'keys' | null>(null);
  const [place, setPlace] = useState<SubPlace | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pointer = useRef('mouse');

  const close = useCallback((focusItem: boolean) => {
    window.clearTimeout(timer.current);
    setOpen(null);
    setPlace(null);
    if (focusItem) trigger.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    parent?.setSub(() => {
      close(true);
    });
    return () => {
      parent?.setSub(null);
    };
  }, [open, parent, close]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const box = panel.current;
    const item = trigger.current;
    const menuBox = item?.closest<HTMLElement>('.popover');
    if (!open || !box || !item || !menuBox) return;
    const host = menuBox.getBoundingClientRect();
    const at = item.getBoundingClientRect();
    const { width, height } = box.getBoundingClientRect();
    let left: number;
    let top = at.top - host.top - MARGIN;
    let side: SubPlace['side'] = 1;
    if (host.right + SUB_GAP + width <= window.innerWidth - MARGIN) left = host.width + SUB_GAP;
    else if (host.left - SUB_GAP - width >= MARGIN) {
      left = -SUB_GAP - width;
      side = -1;
    } else {
      // Narrow screens: over the menu, just under the item.
      left = Math.min(at.left - host.left + 24, window.innerWidth - MARGIN - width - host.left);
      top = at.bottom - host.top + 4;
      side = 0;
    }
    top = Math.max(
      MARGIN - host.top,
      Math.min(top, window.innerHeight - MARGIN - height - host.top),
    );
    setPlace({ left, top, side });
  }, [open]);

  useEffect(() => {
    if (open === 'keys' && place)
      panel.current?.querySelector<HTMLElement>(FOCUSABLE_ITEM)?.focus({ preventScroll: true });
  }, [open, place]);

  const later = (run: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(run, ms);
  };

  const onPanelKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') close(false);
    else if (panel.current) menuKeys(event, panel.current);
  };

  const slide = calm ? 0 : MENU.popover.submenuSlidePx * -(place?.side ?? 1);

  return (
    <div
      className="submenu"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        later(() => {
          setOpen((now) => now ?? 'pointer');
        }, MENU.popover.submenuOpenMs);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        later(() => {
          close(false);
        }, MENU.popover.submenuCloseMs);
      }}
    >
      <button
        ref={trigger}
        type="button"
        role="menuitem"
        className="menu-item"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        onPointerDown={(event) => {
          pointer.current = event.pointerType;
        }}
        onClick={(event) => {
          // A click from the keyboard (detail 0) moves into the submenu; a tap toggles it; a mouse has opened it on hover.
          if (event.detail === 0) setOpen('keys');
          else if (open === null) setOpen('pointer');
          else if (pointer.current !== 'mouse') close(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          setOpen('keys');
        }}
      >
        <ItemIcon stroke={1.8} aria-hidden />
        <span className="menu-item-label">{label}</span>
        <IconChevronRight className="menu-item-chevron" stroke={2} aria-hidden />
      </button>
      <AnimatePresence>
        {open ? (
          <m.div
            ref={panel}
            key="submenu"
            role="menu"
            aria-label={label}
            className="popover popover--sub"
            style={
              place
                ? { left: place.left, top: place.top }
                : { visibility: 'hidden', left: 0, top: 0 }
            }
            onKeyDown={onPanelKey}
            initial={{ opacity: 0, x: slide }}
            animate={{
              opacity: 1,
              x: 0,
              transition: { duration: MENU.popover.durationS, ease: [0.16, 1, 0.3, 1] },
            }}
            exit={{ opacity: 0, x: slide, transition: { duration: MENU.popover.durationS * 0.8 } }}
          >
            {children}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
