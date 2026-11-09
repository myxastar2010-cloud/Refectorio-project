import {
  drinking,
  markKey,
  totals,
  type DayPlan,
  type Plan,
  type Tracking,
} from '@refectorio/menu-core';
import { IconDroplet, IconFlame, IconInfoCircle, IconMinus } from '@tabler/icons-react';
import { m } from 'motion/react';
import { useState } from 'react';
import { menu } from '../../../content/menu.ru';
import { fill, formatWhole, pluralRu } from '../../../lib/format';
import { useCalmMotion } from '../../../motion/hooks';
import { Popover } from '../components/Popover';
import { CountUp } from './CountUp';
import type { DayKind } from '../week/dates';

type Props = {
  readonly plan: Plan;
  readonly day: DayPlan | null;
  readonly tracking: Tracking;
  readonly kind: DayKind;
  readonly deemphasizeNumbers: boolean;
  /** +1 / −1 glass of the selected day. */
  readonly onWater: (delta: 1 | -1) => void;
  readonly onNotify: (text: string) => void;
};

/** More glasses than this: a compact bar instead of dots (ТЗ фаза 4 §5). */
const MAX_DOTS = 8;

/**
 * «Вода» and «Калории» (ТЗ фаза 4 §5, mockup): both follow the selected day — the past shows its final numbers, the
 * future is inactive. A tap on «Вода» is one more glass; a right click (or its ⋯ via the context-menu key) offers
 * «−1 стакан» and how the target is counted.
 */
export function Widgets({
  plan,
  day,
  tracking,
  kind,
  deemphasizeNumbers,
  onWater,
  onNotify,
}: Props) {
  const calm = useCalmMotion();
  // The water's menu (right click, the context-menu key) and its «Как считаем?» note, both next to the widget.
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
  const [howAt, setHowAt] = useState<HTMLElement | null>(null);
  const t = day ? tracking.days[day.date] : undefined;
  const water = day ? drinking(day, plan.targets, t) : null;
  const drunk = water ? Math.floor(water.drunkGlasses + 1e-6) : 0;
  const goal = water?.targetGlasses ?? 0;
  const inactive = kind === 'future' || kind === 'beforeMenu' || !day;
  const eaten = day
    ? totals(day, { eatenOnly: true, ...(t ? { tracking: t } : {}) }).energyKcal
    : 0;
  const target = plan.targets.energyKcal;
  const meals = day ? Object.entries(day.meals).filter(([, items]) => items.length > 0) : [];
  const mealsEaten = meals.filter(([id, items]) =>
    items.every((item) => t?.eaten[markKey(id, item.itemId)] !== undefined),
  ).length;
  const share = Math.min(1, eaten / target);

  return (
    <div className="widgets" role="group" aria-label={menu.widgets.label}>
      <div
        className="widget widget--water"
        data-inactive={inactive || undefined}
        data-reached={drunk >= goal || undefined}
      >
        <button
          type="button"
          className="widget-hit"
          aria-label={`${menu.widgets.water.title}: ${String(drunk)} ${fill(menu.widgets.water.of, { n: `${String(goal)} ${pluralRu(goal, menu.glasses)}` })}. ${menu.widgets.water.add}`}
          aria-disabled={inactive || undefined}
          onClick={() => {
            if (inactive) onNotify(menu.widgets.future);
            else onWater(1);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuAt(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
              event.preventDefault();
              setMenuAt(event.currentTarget);
            }
          }}
        />
        <p className="widget-title">
          {menu.widgets.water.title}
          <IconDroplet className="widget-icon" aria-hidden />
        </p>
        <p className="widget-value">
          <m.span
            key={drunk}
            className="widget-number"
            initial={calm ? false : { y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          >
            {drunk}
          </m.span>
          <span className="widget-of">
            {fill(menu.widgets.water.of, {
              n: `${String(goal)}\u00a0${pluralRu(goal, menu.glasses)}`,
            })}
          </span>
        </p>
        {goal <= MAX_DOTS ? (
          <span className="widget-dots" aria-hidden>
            {Array.from({ length: goal }, (_, i) => (
              <span key={i} className="widget-dot" data-filled={i < drunk || undefined} />
            ))}
          </span>
        ) : (
          <span className="widget-bar" aria-hidden>
            <span style={{ transform: `scaleX(${Math.min(1, drunk / goal).toFixed(3)})` }} />
          </span>
        )}
        <Popover
          anchor={menuAt}
          label={menu.widgets.water.menu}
          role="menu"
          onClose={() => {
            setMenuAt(null);
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={inactive || drunk === 0}
            onClick={() => {
              setMenuAt(null);
              onWater(-1);
            }}
          >
            <IconMinus stroke={2} aria-hidden />
            {menu.widgets.water.remove}
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              const anchor = menuAt;
              setMenuAt(null);
              setHowAt(anchor);
            }}
          >
            <IconInfoCircle stroke={2} aria-hidden />
            {menu.widgets.water.how}
          </button>
        </Popover>
        <Popover
          anchor={howAt}
          label={menu.widgets.water.how}
          role="dialog"
          onClose={() => {
            setHowAt(null);
          }}
        >
          <p className="popover-note">{menu.widgets.water.howText}</p>
        </Popover>
      </div>
      <div className="widget widget--calories" data-inactive={inactive || undefined}>
        <p className="widget-title">
          {menu.widgets.calories.title}
          <IconFlame className="widget-icon" aria-hidden />
        </p>
        {deemphasizeNumbers ? (
          <p className="widget-value widget-value--text">
            {fill(menu.widgets.calories.meals, { eaten: mealsEaten, total: meals.length })}
          </p>
        ) : (
          <p className="widget-value">
            <CountUp className="widget-number" value={eaten} format={formatWhole} calm={calm} />
            <span className="widget-of">
              {fill(menu.widgets.calories.of, { n: formatWhole(target) })}
            </span>
          </p>
        )}
        <span className="widget-bar" aria-hidden>
          <span
            style={{
              transform: `scaleX(${(deemphasizeNumbers ? mealsEaten / Math.max(1, meals.length) : share).toFixed(3)})`,
            }}
          />
        </span>
      </div>
    </div>
  );
}
