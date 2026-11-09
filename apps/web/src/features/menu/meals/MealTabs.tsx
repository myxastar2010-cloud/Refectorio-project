import type { Meal } from '@refectorio/menu-core';
import {
  IconCheck,
  IconLayoutGridAdd,
  IconMinus,
  IconPencil,
  IconPlus,
  IconToolsKitchen2,
  IconBowlChopsticks,
} from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import { useCalmMotion } from '../../../motion/hooks';
import { EASE_OUT_EXPO, MENU } from '../../../motion/tokens';
import { Popover } from '../components/Popover';

type Props = {
  readonly meals: readonly Meal[];
  readonly selected: string;
  readonly onSelect: (mealId: string) => void;
  readonly editing: boolean;
  readonly onEdit: (editing: boolean) => void;
  /** Why a meal cannot be removed, or null. */
  readonly lockOf: (mealId: string) => string | null;
  readonly onRemove: (meal: Meal) => void;
  readonly onAddMeal: () => void;
  readonly onAddDish: () => void;
  readonly onAddWidget: () => void;
  readonly onMove: (mealId: string, toIndex: number) => void;
  readonly busy: boolean;
};

/** Touch lifts a pill after this press (mouse: as soon as it moves). */
const TOUCH_LIFT_MS = 300;
const DRAG_START_PX = 4;

/** A pill's place in the row: its slot's left edge in the list's scrolled content (slots never move by transform). */
function placeOf(pill: HTMLElement, list: HTMLElement): number {
  const slot = pill.parentElement ?? pill;
  return slot.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
}

/**
 * «Завтрак», «Обед», «Ужин» (+ snacks) as tabs (ТЗ фаза 4 §6, mockup «редактирование»): the active one filled black;
 * ←/→, Home, End move between them. The pencil turns on the edit mode: a dark «−» on each removable pill, a dark «+»
 * after them, the pencil becomes the accent ✓ (Esc leaves too). Pills reorder by drag (mouse; touch after a 300 ms
 * press) or by keys (Space lifts, ←/→ move, Space drops, Esc cancels) — the neighbours slide aside (FLIP, transforms).
 */
export function MealTabs(props: Props) {
  const { meals, selected, onSelect, editing, onEdit, lockOf, onRemove, busy } = props;
  const calm = useCalmMotion();
  const listRef = useRef<HTMLDivElement>(null);
  // A local order while a pill is dragged — and after the drop until the engine's plan brings it (`base` is the
  // structure it was made on; a failed move ends `busy` with the old structure, and the pills slide back).
  const [order, setOrder] = useState<{
    readonly ids: readonly string[];
    readonly base: readonly Meal[];
    readonly dropped: boolean;
  } | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ meal: Meal; anchor: HTMLElement } | null>(null);
  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const local = order && order.base === meals && (!order.dropped || busy) ? order.ids : null;
  const shown = local
    ? local.map((id) => meals.find((meal) => meal.id === id)).filter((meal): meal is Meal => !!meal)
    : meals;

  // FLIP: after a reorder each pill starts from where it was and slides to its new place (transform only).
  // Places are measured on the slots (never transformed): a pill's own offsetLeft is 0 inside its slot.
  const lefts = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    for (const pill of list.querySelectorAll<HTMLElement>('[data-meal]')) {
      const id = pill.dataset.meal ?? '';
      const before = lefts.current.get(id);
      const now = placeOf(pill, list);
      lefts.current.set(id, now);
      if (before === undefined || before === now || calm || pill.dataset.dragging) continue;
      pill.animate(
        [{ transform: `translateX(${String(before - now)}px)` }, { transform: 'none' }],
        { duration: MENU.reorderMs, easing: `cubic-bezier(${EASE_OUT_EXPO.join(', ')})` },
      );
    }
  });

  const indexOf = (id: string) => shown.findIndex((meal) => meal.id === id);
  const reorder = (id: string, to: number) => {
    const ids = shown.map((meal) => meal.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
    setOrder({ ids, base: meals, dropped: false });
  };
  const commit = (id: string) => {
    const to = indexOf(id);
    const from = meals.findIndex((meal) => meal.id === id);
    setLifted(null);
    if (to >= 0 && to !== from) {
      setOrder((o) => (o ? { ...o, dropped: true } : o));
      props.onMove(id, to);
    } else setOrder(null);
  };
  const cancel = () => {
    setOrder(null);
    setLifted(null);
    setAnnouncement(menu.meals.drag.cancelled);
  };

  // Pointer drag: the pill follows the pointer; crossing a neighbour's middle swaps them. Moves and the drop are heard
  // on the window: a swap moves the pills in the DOM, which drops the pointer capture (the drop would land elsewhere).
  const drag = useRef<{
    id: string;
    pill: HTMLElement;
    pointer: number;
    startX: number;
    grab: number;
    active: boolean;
    timer: number;
    release: () => void;
    /** The pill's left edge in the list (from the pointer), kept to re-place it after a swap moves its slot. */
    x: number | null;
  } | null>(null);
  useLayoutEffect(() => {
    const d = drag.current;
    const list = listRef.current;
    if (!d?.active || d.x === null || !list) return;
    d.pill.style.transform = `translateX(${String(d.x - placeOf(d.pill, list))}px) scale(1.04)`;
  });
  const latest = useRef<{
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
  } | null>(null);
  useEffect(
    () => () => {
      drag.current?.release();
    },
    [],
  );
  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, meal: Meal) => {
    if (!editing || busy || event.button !== 0) return;
    const pill = event.currentTarget;
    const start = event.clientX;
    const move = (e: PointerEvent) => {
      latest.current?.move(e);
    };
    const up = (e: PointerEvent) => {
      latest.current?.up(e);
    };
    const d = {
      id: meal.id,
      pill,
      pointer: event.pointerId,
      startX: start,
      grab: start - pill.getBoundingClientRect().left,
      active: false,
      timer: 0,
      x: null,
      release: () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      },
    };
    drag.current?.release();
    drag.current = d;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    if (event.pointerType === 'touch') {
      d.timer = window.setTimeout(() => {
        d.active = true;
        pill.setPointerCapture(d.pointer);
        pill.dataset.dragging = 'true';
        setLifted(meal.id);
        if ('vibrate' in navigator) navigator.vibrate(10);
      }, TOUCH_LIFT_MS);
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    const d = drag.current;
    const list = listRef.current;
    if (!d || d.pointer !== event.pointerId || !list) return;
    const { pill } = d;
    if (!d.active) {
      if (event.pointerType === 'touch') {
        // A swipe before the lift scrolls the row instead.
        if (Math.abs(event.clientX - d.startX) > DRAG_START_PX) window.clearTimeout(d.timer);
        return;
      }
      if (Math.abs(event.clientX - d.startX) < DRAG_START_PX) return;
      d.active = true;
      pill.setPointerCapture(d.pointer);
      pill.dataset.dragging = 'true';
      setLifted(d.id);
    }
    event.preventDefault();
    const listLeft = list.getBoundingClientRect().left - list.scrollLeft;
    const x = event.clientX - d.grab - listLeft;
    d.x = x;
    pill.style.transform = `translateX(${String(x - placeOf(pill, list))}px) scale(1.04)`;
    const middle = x + pill.offsetWidth / 2;
    const others = [...list.querySelectorAll<HTMLElement>('[data-meal]')].filter(
      (el) => el !== pill,
    );
    const to = others.filter((el) => placeOf(el, list) + el.offsetWidth / 2 < middle).length;
    if (to !== indexOf(d.id)) reorder(d.id, to);
  };
  const onPointerUp = (event: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    drag.current = null;
    d.release();
    window.clearTimeout(d.timer);
    const { pill } = d;
    delete pill.dataset.dragging;
    pill.style.transform = '';
    if (!d.active) return;
    event.preventDefault();
    if (event.type === 'pointercancel') cancel();
    else commit(d.id);
  };

  // The window's listeners call this render's handlers (they read this render's order).
  useLayoutEffect(() => {
    latest.current = { move: onPointerMove, up: onPointerUp };
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focusedId = (document.activeElement as HTMLElement | null)?.dataset.meal;
    if (editing && focusedId) {
      if (event.key === ' ' || event.key === 'Enter') {
        if (event.key === 'Enter' && !lifted) return;
        event.preventDefault();
        const meal = meals.find((x) => x.id === focusedId);
        if (!lifted) {
          setLifted(focusedId);
          setAnnouncement(fill(menu.meals.drag.lifted, { meal: meal?.titleRu ?? '' }));
        } else {
          setAnnouncement(
            fill(menu.meals.drag.dropped, { meal: meal?.titleRu ?? '', n: indexOf(focusedId) + 1 }),
          );
          commit(focusedId);
        }
        return;
      }
      if (lifted && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        const to = indexOf(lifted) + (event.key === 'ArrowRight' ? 1 : -1);
        if (to < 0 || to >= shown.length) return;
        reorder(lifted, to);
        const meal = meals.find((x) => x.id === lifted);
        setAnnouncement(
          fill(menu.meals.drag.position, {
            meal: meal?.titleRu ?? '',
            n: to + 1,
            total: shown.length,
          }),
        );
        return;
      }
      if (lifted && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
    }
    const index = shown.findIndex((meal) => meal.id === selected);
    const next =
      event.key === 'ArrowRight'
        ? shown[(index + 1) % shown.length]
        : event.key === 'ArrowLeft'
          ? shown[(index - 1 + shown.length) % shown.length]
          : event.key === 'Home'
            ? shown[0]
            : event.key === 'End'
              ? shown.at(-1)
              : undefined;
    if (!next) return;
    event.preventDefault();
    onSelect(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-meal="${next.id}"]`)?.focus();
  };

  return (
    <div
      className="meals"
      data-editing={editing || undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && editing && !lifted && !confirm && !addMenu) {
          event.preventDefault();
          onEdit(false);
        }
      }}
    >
      <div
        ref={listRef}
        className="meal-tabs"
        // Editing, the pills sit with their «−» badges and «+»: a toolbar of controls (a tablist holds tabs only).
        role={editing ? 'toolbar' : 'tablist'}
        aria-label={menu.meals.label}
        aria-describedby={editing ? 'meal-drag-hint' : undefined}
        onKeyDown={onKeyDown}
      >
        {shown.map((meal, index) => {
          const active = meal.id === selected;
          const lock = editing ? lockOf(meal.id) : null;
          return (
            <span key={meal.id} className="meal-tab-slot" data-meal-slot={meal.id}>
              <button
                type="button"
                role={editing ? undefined : 'tab'}
                className="meal-tab"
                data-meal={meal.id}
                data-lifted={lifted === meal.id || undefined}
                aria-selected={editing ? undefined : active}
                aria-current={editing && active ? 'true' : undefined}
                aria-controls="menu-dishes"
                tabIndex={active ? 0 : -1}
                title={lock ?? undefined}
                onClick={() => {
                  onSelect(meal.id);
                }}
                onPointerDown={(event) => {
                  onPointerDown(event, meal);
                }}
              >
                {meal.titleRu}
              </button>
              <AnimatePresence>
                {editing && !lock ? (
                  <m.button
                    type="button"
                    className="meal-badge"
                    aria-label={fill(menu.meals.remove, { meal: meal.titleRu })}
                    disabled={busy}
                    initial={calm ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      transition: { ...MENU.spring, delay: index * MENU.tab.staggerS },
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.4,
                      transition: { duration: MENU.popover.durationS },
                    }}
                    onClick={(event) => {
                      setConfirm({ meal, anchor: event.currentTarget });
                    }}
                  >
                    <IconMinus stroke={3} aria-hidden />
                  </m.button>
                ) : null}
              </AnimatePresence>
            </span>
          );
        })}
      </div>
      <AnimatePresence>
        {editing ? (
          <m.button
            type="button"
            className="menu-round meal-add"
            aria-label={menu.meals.add}
            aria-haspopup="menu"
            aria-expanded={addMenu !== null}
            disabled={busy}
            initial={calm ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1, transition: MENU.spring }}
            exit={{ opacity: 0, scale: 0.6, transition: { duration: MENU.popover.durationS } }}
            onClick={(event) => {
              setAddMenu(event.currentTarget);
            }}
          >
            <IconPlus stroke={2.6} aria-hidden />
          </m.button>
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        className="menu-round meal-edit"
        aria-pressed={editing}
        aria-label={editing ? menu.meals.done : menu.meals.edit}
        data-done={editing || undefined}
        onClick={() => {
          onEdit(!editing);
        }}
      >
        {editing ? <IconCheck stroke={2.6} aria-hidden /> : <IconPencil stroke={2} aria-hidden />}
      </button>
      <span id="meal-drag-hint" className="visually-hidden">
        {menu.meals.drag.hint}
      </span>
      <span className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </span>
      <Popover
        anchor={confirm?.anchor ?? null}
        label={confirm ? fill(menu.meals.remove, { meal: confirm.meal.titleRu }) : ''}
        role="alertdialog"
        onClose={() => {
          setConfirm(null);
        }}
      >
        {confirm ? (
          <div className="meal-confirm">
            <p>{fill(menu.meals.confirm, { meal: confirm.meal.titleRu })}</p>
            <div className="meal-confirm-actions">
              <button
                type="button"
                className="menu-pill menu-pill--danger"
                onClick={() => {
                  onRemove(confirm.meal);
                  setConfirm(null);
                }}
              >
                {menu.meals.confirmYes}
              </button>
              <button
                type="button"
                // The least harmful choice comes first (a stray Enter only cancels).
                data-autofocus
                className="menu-pill menu-pill--ghost"
                onClick={() => {
                  setConfirm(null);
                }}
              >
                {menu.meals.confirmNo}
              </button>
            </div>
          </div>
        ) : null}
      </Popover>
      <Popover
        anchor={addMenu}
        label={menu.meals.addMenu}
        role="menu"
        onClose={() => {
          setAddMenu(null);
        }}
      >
        {[
          { label: menu.meals.addMeal, icon: IconToolsKitchen2, run: props.onAddMeal },
          { label: menu.meals.addDish, icon: IconBowlChopsticks, run: props.onAddDish },
          { label: menu.meals.addWidget, icon: IconLayoutGridAdd, run: props.onAddWidget },
        ].map((item) => {
          const ItemIcon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setAddMenu(null);
                item.run();
              }}
            >
              <ItemIcon stroke={1.8} aria-hidden />
              {item.label}
            </button>
          );
        })}
      </Popover>
    </div>
  );
}
