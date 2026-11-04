import { drinking, totals, type Plan, type Tracking } from '@refectorio/menu-core';
import { AnimatePresence, m, usePresence } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { menu } from '../../../content/menu.ru';
import { fill, formatWhole, pluralRu } from '../../../lib/format';
import { revealMotion, useCornerMorph } from '../../../motion/cornerMorph';
import { useCalmMotion } from '../../../motion/hooks';
import { dayKind, dayMonth, dayNumber, statusOf, weekdayLong, yearOf } from './dates';

type Props = {
  /** The day whose card is open, and its pill. */
  readonly open: { readonly date: string; readonly pill: HTMLElement } | null;
  readonly plan: Plan;
  readonly tracking: Tracking;
  readonly today: string;
  readonly deemphasizeNumbers: boolean;
  readonly onClose: () => void;
};

/**
 * The expanded day (ТЗ фаза 4 §4, mockup «раскрытый день недели»): the pill grows into a card with the team card's
 * corner morph — year, «21 июля», the weekday and what the day is: today, planned, or the past day's status with a small
 * «eaten of target» line. Esc, an outside click or a scroll close it; focus returns to the pill.
 */
export function DayCard(props: Props) {
  return (
    <AnimatePresence>
      {props.open ? <DayCardBody key={props.open.date} {...props} open={props.open} /> : null}
    </AnimatePresence>
  );
}

/** Scrolls this soon after opening belong to the gesture that opened the card. */
const SCROLL_GRACE_MS = 250;

function DayCardBody({
  open,
  plan,
  tracking,
  today,
  deemphasizeNumbers,
  onClose,
}: Props & { readonly open: NonNullable<Props['open']> }) {
  const [present, safeToRemove] = usePresence();
  const calm = useCalmMotion();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const anchorRef: RefObject<HTMLElement | null> = useRef(open.pill);
  const [revealed, setRevealed] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);

  // Its place: centred on the pill, its bottom on the pill's bottom, inside the window.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const pill = open.pill.getBoundingClientRect();
    const { width, height } = card.getBoundingClientRect();
    const margin = 8;
    setBox({
      left: Math.min(
        Math.max(margin, pill.left + pill.width / 2 - width / 2),
        window.innerWidth - width - margin,
      ),
      top: Math.max(margin, pill.bottom - height),
    });
  }, [open.pill]);

  useCornerMorph({
    surface: surfaceRef,
    anchor: anchorRef,
    present: present && box !== null,
    calm,
    onReveal: () => {
      setRevealed(true);
    },
    onLanded: () => undefined,
    onDone: () => {
      safeToRemove?.();
    },
  });

  // Esc, a press outside or a scroll anywhere: closed, focus back on the pill.
  useEffect(() => {
    if (!present) return undefined;
    cardRef.current?.focus({ preventScroll: true });
    const close = () => {
      onClose();
      open.pill.focus({ preventScroll: true });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    const onDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) onClose();
    };
    // A scroll of the page or its column closes it — not the scroll that brought the pill into view.
    const openedAt = performance.now();
    const onScroll = () => {
      if (performance.now() - openedAt > SCROLL_GRACE_MS) onClose();
    };
    const column = open.pill.closest('.menu-main');
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('wheel', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    column?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('wheel', onScroll);
      window.removeEventListener('scroll', onScroll);
      column?.removeEventListener('scroll', onScroll);
    };
  }, [present, onClose, open.pill]);

  const { date } = open;
  const kind = dayKind(plan, date, today);
  const status = statusOf(plan, date, tracking, today);
  const day = plan.days.find((d) => d.date === date);
  const summary = (() => {
    if (!day || kind !== 'past' || deemphasizeNumbers) return null;
    const t = tracking.days[date];
    const water = drinking(day, plan.targets, t);
    const glasses = Math.round(water.drunkGlasses);
    return fill(menu.dayCard.summary, {
      eaten: formatWhole(
        totals(day, { eatenOnly: true, ...(t ? { tracking: t } : {}) }).energyKcal,
      ),
      target: formatWhole(plan.targets.energyKcal),
      drunk: String(glasses),
      glasses: `${String(water.targetGlasses)}\u00a0${pluralRu(water.targetGlasses, menu.glasses)}`,
    });
  })();
  const line =
    kind === 'today'
      ? menu.dayCard.today
      : kind === 'future'
        ? menu.dayCard.planned
        : kind === 'beforeMenu' || status === 'none'
          ? menu.dayCard.noMenu
          : menu.dayCard.status[status];

  return (
    <div
      ref={cardRef}
      className="day-card"
      role="dialog"
      aria-label={`${dayMonth(date)}, ${weekdayLong(date)}`}
      tabIndex={-1}
      style={box ? { left: box.left, top: box.top } : { visibility: 'hidden' }}
      inert={!present}
    >
      <div ref={surfaceRef} className="day-card-surface" aria-hidden />
      <m.p className="day-card-year" {...revealMotion(0, revealed, calm)}>
        {yearOf(date)}
      </m.p>
      <m.p className="day-card-date" {...revealMotion(1, revealed, calm)}>
        <b>{dayNumber(date)}</b> {dayMonth(date).split('\u00a0')[1]}
      </m.p>
      <m.p className="day-card-weekday" {...revealMotion(1, revealed, calm)}>
        {weekdayLong(date)}
      </m.p>
      <m.div className="day-card-status" {...revealMotion(2, revealed, calm)}>
        {kind === 'past' && status !== 'none' ? (
          <span className="day-dot" data-status={status} aria-hidden />
        ) : null}
        <span>{line}</span>
        {summary ? <span className="day-card-summary">{summary}</span> : null}
      </m.div>
    </div>
  );
}
