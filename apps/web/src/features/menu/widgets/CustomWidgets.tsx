import type { Plan, Tracking } from '@refectorio/menu-core';
import { IconArrowLeft, IconArrowRight, IconMinus, IconTrash } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { menu } from '../../../content/menu.ru';
import { fill, formatAmount, formatWhole } from '../../../lib/format';
import { useCalmMotion } from '../../../motion/hooks';
import { Popover } from '../components/Popover';
import type { WidgetConfig } from '../store/schema';
import { widgetName, widgetValue } from './nutrientWidgets';

type Props = {
  readonly widgets: readonly WidgetConfig[];
  readonly plan: Plan;
  readonly tracking: Tracking;
  readonly date: string;
  readonly editing: boolean;
  readonly deemphasizeNumbers: boolean;
  readonly onMove: (id: string, delta: -1 | 1) => void;
  readonly onRemove: (widget: WidgetConfig) => void;
};

/**
 * The person's own widgets (ТЗ фаза 4 §5): chips between the goal and the search (phones: a row under the top bar) —
 * the nutrient eaten so far against the norm (or the limit) with a thin bar; «нет данных» where the marked dishes have
 * none. Their ⋯ (a click) moves or removes them; edit mode adds a «−» badge. Up to six, kept in this browser.
 */
export function CustomWidgets({
  widgets,
  plan,
  tracking,
  date,
  editing,
  deemphasizeNumbers,
  onMove,
  onRemove,
}: Props) {
  const calm = useCalmMotion();
  const [menuOf, setMenuOf] = useState<{ widget: WidgetConfig; anchor: HTMLElement } | null>(null);
  if (widgets.length === 0) return null;
  const c = menu.widgets.custom;
  return (
    <ul className="custom-widgets" aria-label={c.label}>
      <AnimatePresence initial={false}>
        {widgets.map((widget) => {
          const name = widgetName(widget.nutrient);
          const { value, target, unit } = widgetValue(widget, plan, tracking, date);
          const units = menu.units[unit];
          const amount = (n: number) =>
            `${unit === 'kcal' ? formatWhole(n) : formatAmount(n)}\u00a0${units}`;
          const of = target
            ? fill(target.kind === 'limit' ? c.ofLimit : c.ofNorm, { n: amount(target.amount) })
            : c.noNorm;
          const shown =
            value === null ? c.noData : deemphasizeNumbers ? '' : `${amount(value)} ${of}`;
          const share = value !== null && target ? Math.min(1, value / target.amount) : 0;
          return (
            <m.li
              key={widget.id}
              className="custom-widget"
              data-color={widget.color}
              data-over={
                (target?.kind === 'limit' && value !== null && value > target.amount) || undefined
              }
              initial={calm ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.22 } }}
              exit={{ opacity: 0, scale: calm ? 1 : 0.9, transition: { duration: 0.14 } }}
            >
              <button
                type="button"
                className="custom-widget-hit"
                aria-haspopup="menu"
                aria-label={`${name}${widget.scope === 'day' ? '' : `, ${c.scopes[widget.scope].toLowerCase()}`}: ${shown}`}
                onClick={(event) => {
                  setMenuOf({ widget, anchor: event.currentTarget });
                }}
              >
                <span className="custom-widget-name">{name}</span>
                <span className="custom-widget-value">{shown}</span>
                {deemphasizeNumbers || !target ? null : (
                  <span className="custom-widget-bar" aria-hidden>
                    <span style={{ transform: `scaleX(${share.toFixed(3)})` }} />
                  </span>
                )}
              </button>
              {editing ? (
                <button
                  type="button"
                  className="meal-badge custom-widget-badge"
                  aria-label={fill(c.removeBadge, { name })}
                  onClick={() => {
                    onRemove(widget);
                  }}
                >
                  <IconMinus stroke={3} aria-hidden />
                </button>
              ) : null}
            </m.li>
          );
        })}
      </AnimatePresence>
      <Popover
        anchor={menuOf?.anchor ?? null}
        label={menuOf ? fill(c.menu, { name: widgetName(menuOf.widget.nutrient) }) : ''}
        role="menu"
        onClose={() => {
          setMenuOf(null);
        }}
      >
        {menuOf ? (
          <>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={widgets[0]?.id === menuOf.widget.id}
              onClick={() => {
                onMove(menuOf.widget.id, -1);
                setMenuOf(null);
              }}
            >
              <IconArrowLeft stroke={1.8} aria-hidden />
              {c.left}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={widgets.at(-1)?.id === menuOf.widget.id}
              onClick={() => {
                onMove(menuOf.widget.id, 1);
                setMenuOf(null);
              }}
            >
              <IconArrowRight stroke={1.8} aria-hidden />
              {c.right}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item menu-item--danger"
              onClick={() => {
                onRemove(menuOf.widget);
                setMenuOf(null);
              }}
            >
              <IconTrash stroke={1.8} aria-hidden />
              {c.remove}
            </button>
          </>
        ) : null}
      </Popover>
    </ul>
  );
}
