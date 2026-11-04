import { addDays, weekStart, type Plan, type Tracking } from '@refectorio/menu-core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { m } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { menu } from '../../../content/menu.ru';
import { useCalmMotion } from '../../../motion/hooks';
import { MENU } from '../../../motion/tokens';
import { dayKind, dayMonth, dayNumber, statusOf, weekdayLong, weekdayShort, weekOf } from './dates';

type Props = {
  readonly plan: Plan;
  readonly tracking: Tracking;
  readonly today: string;
  readonly date: string;
  /** A new selected date (a day, or the same weekday of another week). */
  readonly onSelect: (date: string) => void;
  /** The day card: right click, long press, the context-menu key. */
  readonly onCard: (date: string, pill: HTMLElement) => void;
  /** Cards shimmer while new weeks are planned. */
  readonly extending: boolean;
};

/**
 * The seven days of the shown week (ТЗ фаза 4 §4): the selected one filled with the accent, past days with their
 * status dot, days before the menu muted. Weeks page by wheel or touchpad (one week per gesture, the inertia tail
 * ignored), a swipe (axis lock, rubber band), keys (←/→ a day, PageUp/PageDown a week, Home today) and the small ‹ ›.
 */
export function WeekStrip({ plan, tracking, today, date, onSelect, onCard, extending }: Props) {
  const calm = useCalmMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const days = weekOf(date);
  const shownWeek = weekStart(date);
  const awayFromToday = shownWeek !== weekStart(today);
  // The direction of the last paging, for the slide of the new week.
  const [direction, setDirection] = useState(0);
  const select = (next: string) => {
    if (next === date) return;
    setDirection(Math.sign(next.localeCompare(date)));
    onSelect(next);
  };
  const page = (weeks: number) => {
    select(addDays(date, 7 * weeks));
  };
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  });

  // Wheel and touchpad: one gesture — one week. The quiet window restarts with every event, so the inertia tail
  // of a flick never pages twice.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    let sum = 0;
    let quietUntil = 0;
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      event.preventDefault();
      const now = performance.now();
      if (now < quietUntil) {
        quietUntil = now + MENU.week.wheelQuietMs;
        return;
      }
      sum += event.deltaMode === 1 ? delta * 16 : delta;
      if (Math.abs(sum) >= MENU.week.swipeMinPx) {
        pageRef.current(Math.sign(sum));
        sum = 0;
        quietUntil = now + MENU.week.wheelQuietMs;
      }
    };
    row.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      row.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Swipe: the row follows the finger (rubber band), a long enough swipe pages; a vertical move is left to the page.
  const swipe = useRef<{ id: number; x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return;
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
  };
  const onPointerMove = (event: PointerEvent) => {
    const s = swipe.current;
    const list = listRef.current;
    if (!s || s.id !== event.pointerId || !list) return;
    const dx = event.clientX - s.x;
    const dy = event.clientY - s.y;
    if (!s.axis && Math.hypot(dx, dy) > MENU.longPressSlopPx) {
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.axis === 'x') (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    if (s.axis === 'x' && !calm)
      list.style.transform = `translateX(${(dx * MENU.week.rubberBand).toFixed(1)}px)`;
  };
  const onPointerEnd = (event: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    const list = listRef.current;
    if (list) list.style.transform = '';
    if (!s || s.axis !== 'x' || event.type === 'pointercancel') return;
    const dx = event.clientX - s.x;
    if (Math.abs(dx) >= MENU.week.swipeMinPx) page(dx < 0 ? 1 : -1);
  };

  // Keys inside the strip: the arrows walk the days across weeks, PageUp/PageDown page, Home is today.
  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 };
    const delta = step[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      select(addDays(date, delta));
    } else if (event.key === 'Home') {
      event.preventDefault();
      select(today);
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      const pill = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (pill) onCard(date, pill);
    }
  };
  // The selected pill keeps the focus while the arrows move it (roving tabindex).
  const focusWithin = useRef(false);
  useEffect(() => {
    if (!focusWithin.current) return;
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.focus({ preventScroll: true });
  }, [date]);

  // Long press on a pill (touch): 450 ms without moving more than 8 px opens its card.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  return (
    <div className="week" data-extending={extending || undefined}>
      <button
        type="button"
        className="week-arrow week-arrow--prev"
        aria-label={menu.week.prev}
        onClick={() => {
          page(-1);
        }}
      >
        <IconChevronLeft stroke={2} aria-hidden />
      </button>
      <div
        ref={rowRef}
        className="week-row"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <m.ol
          ref={listRef}
          key={shownWeek}
          className="week-days"
          role="tablist"
          aria-label={menu.week.label}
          onKeyDown={onKeyDown}
          onFocus={() => {
            focusWithin.current = true;
          }}
          onBlur={() => {
            focusWithin.current = false;
          }}
          initial={calm || direction === 0 ? false : { opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0, transition: MENU.spring }}
        >
          {days.map((day) => {
            const kind = dayKind(plan, day, today);
            const status = kind === 'past' ? statusOf(plan, day, tracking, today) : 'none';
            const selected = day === date;
            const label = [
              `${weekdayLong(day)}, ${dayMonth(day)}`,
              kind === 'today' ? menu.week.today.toLowerCase() : null,
              status !== 'none' ? menu.week.statusLabel[status] : null,
              kind === 'beforeMenu' ? menu.week.beforeMenu.toLowerCase() : null,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <li key={day} role="presentation">
                <button
                  type="button"
                  role="tab"
                  className="day-pill"
                  aria-selected={selected}
                  aria-label={label}
                  aria-controls="menu-dishes"
                  tabIndex={selected ? 0 : -1}
                  data-kind={kind}
                  data-today={kind === 'today' || undefined}
                  onClick={() => {
                    select(day);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    cancelPress();
                    onCard(day, event.currentTarget);
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType !== 'touch') return;
                    const pill = event.currentTarget;
                    cancelPress();
                    press.current = {
                      x: event.clientX,
                      y: event.clientY,
                      timer: window.setTimeout(() => {
                        press.current = null;
                        if ('vibrate' in navigator) navigator.vibrate(10);
                        onCard(day, pill);
                      }, MENU.longPressMs),
                    };
                  }}
                  onPointerMove={(event) => {
                    const p = press.current;
                    if (
                      p &&
                      Math.hypot(event.clientX - p.x, event.clientY - p.y) > MENU.longPressSlopPx
                    ) {
                      cancelPress();
                    }
                  }}
                  onPointerUp={cancelPress}
                  onPointerCancel={cancelPress}
                >
                  <span className="day-pill-weekday">{weekdayShort(day)}</span>
                  <span className="day-pill-number">{dayNumber(day)}</span>
                  {status !== 'none' ? (
                    <span className="day-dot" data-status={status} aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </m.ol>
      </div>
      <button
        type="button"
        className="week-arrow week-arrow--next"
        aria-label={menu.week.next}
        onClick={() => {
          page(1);
        }}
      >
        <IconChevronRight stroke={2} aria-hidden />
      </button>
      {awayFromToday ? (
        <button
          type="button"
          className="week-today"
          onClick={() => {
            select(today);
          }}
        >
          {menu.week.today}
        </button>
      ) : null}
    </div>
  );
}
