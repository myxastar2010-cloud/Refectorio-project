import {
  addDays,
  addWater,
  editable,
  markEaten,
  markKey,
  MAX_DAYS_AHEAD,
  weekStart,
  type Plan,
  type SlotRef,
  type Tracking,
  type TrackingError,
} from '@refectorio/menu-core';
import { AnimatePresence, m, type Variants } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { menu } from '../../content/menu.ru';
import { useCalmMotion } from '../../motion/hooks';
import { MENU } from '../../motion/tokens';
import { Pic } from './components/Pic';
import type { Catalog } from './data/catalog';
import { KIKI } from './data/pictures';
import { DishCard } from './dishes/DishCard';
import { DishMenu, ReplacePicker, type DishTarget } from './dishes/DishMenu';
import { DishDetails, type DetailsTarget } from './details/DishDetails';
import { useReplace } from './dishes/useReplace';
import { menuClient } from './engine/client';
import { KikiPanel } from './kiki/KikiPanel';
import { MealTabs } from './meals/MealTabs';
import { useStructure } from './meals/useStructure';
import type { Notify } from './notify';
import { Nav } from './shell/Nav';
import { menuStore, useMenu } from './store/store';
import { TopBar } from './top/TopBar';
import { DayCard } from './week/DayCard';
import { dayKind } from './week/dates';
import { SearchResults } from './search/SearchResults';
import { optionId, useSearch, type SearchEntry } from './search/useSearch';
import { WeekStrip } from './week/WeekStrip';
import { Widgets } from './widgets/Widgets';

type Props = {
  readonly plan: Plan;
  readonly tracking: Tracking;
  readonly catalog: Catalog;
  readonly today: string;
  /** Uncovered by the reveal wave: the content comes in with a short blur-in and a stagger. */
  readonly intro: boolean;
  readonly onHome: () => void;
  readonly onNotify: Notify;
};

const SEARCH_LIST = 'menu-search-results';

const TRACKING_ERRORS: Partial<Record<TrackingError['code'], string>> = {
  futureDay: menu.dish.futureDay,
  tooOld: menu.dish.tooOld,
};

/** The groups of the page come in one after another after the reveal (ТЗ фаза 4 §1). */
const introVariants = (calm: boolean): Variants => ({
  hidden: calm
    ? { opacity: 0 }
    : { opacity: 0, filter: `blur(${String(MENU.intro.blurPx)}px)`, y: 10 },
  shown: (index: number) => ({
    opacity: 1,
    filter: 'blur(0px)',
    y: 0,
    transition: {
      duration: MENU.intro.durationS,
      delay: MENU.intro.delayS + index * MENU.intro.staggerS,
      ease: [0.16, 1, 0.3, 1],
    },
    transitionEnd: { filter: 'none' },
  }),
});

export function MenuPage({ plan, tracking, catalog, today, intro, onHome, onNotify }: Props) {
  const calm = useCalmMotion();
  const answers = useMenu((s) => s.answers);
  const avatar = useMenu((s) => s.settings.avatar);
  const letters = useMenu((s) => s.letters);
  const deemphasizeNumbers = answers?.guardrails.deemphasizeNumbers ?? false;
  const meals = useMemo(
    () => [...plan.structure].sort((a, b) => a.order - b.order),
    [plan.structure],
  );
  const [date, setDate] = useState(today);
  const [mealChoice, setMealChoice] = useState<string | null>(null);
  const mealId = meals.some((meal) => meal.id === mealChoice)
    ? (mealChoice as string)
    : (meals[0]?.id ?? '');
  const [editing, setEditing] = useState(false);
  const [kikiOpen, setKikiOpen] = useState(false);
  const [card, setCard] = useState<{ date: string; pill: HTMLElement } | null>(null);
  const [extending, setExtending] = useState(false);
  const [dishMenu, setDishMenu] = useState<DishTarget | null>(null);
  const [replacing, setReplacing] = useState<DishTarget | null>(null);
  const [details, setDetails] = useState<DetailsTarget | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const found = useSearch(plan, query, today);
  const searching = searchOpen && query.trim() !== '';
  const foundEntries = useMemo(
    () => found.result?.groups.flatMap((g) => g.entries) ?? [],
    [found.result],
  );
  /** Where the main column was scrolled when the search opened: closing it brings the view back exactly. */
  const scrollBefore = useRef(0);

  const openSearch = useCallback(() => {
    scrollBefore.current = document.querySelector('.menu-main')?.scrollTop ?? 0;
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
    setActiveKey(null);
    requestAnimationFrame(() => {
      const main = document.querySelector('.menu-main');
      if (main) main.scrollTop = scrollBefore.current;
    });
  }, []);
  const moveFound = useCallback(
    (delta: 1 | -1) => {
      if (foundEntries.length === 0) return;
      const at = foundEntries.findIndex((e) => e.key === activeKey);
      const next =
        at < 0
          ? delta > 0
            ? 0
            : foundEntries.length - 1
          : (at + delta + foundEntries.length) % foundEntries.length;
      setActiveKey(foundEntries[next]?.key ?? null);
    },
    [foundEntries, activeKey],
  );
  const openFound = useCallback((entry: SearchEntry, element: HTMLElement) => {
    setActiveKey(entry.key);
    setDetails({
      card: element,
      slot: { date: entry.date, meal: entry.meal, index: entry.index },
      itemId: entry.itemId,
      returnFocus: document.querySelector<HTMLElement>('.menu-search input'),
    });
  }, []);

  // «/» or Ctrl+K open the search from anywhere on the page but a field; a press outside it and its results closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as Element | null)?.closest(
        'input, textarea, [contenteditable]',
      );
      const shortcut =
        (event.key === '/' && !typing) ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
      if (!shortcut || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      if (searchOpen) document.querySelector<HTMLElement>('.menu-search input')?.focus();
      else openSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [searchOpen, openSearch]);
  useEffect(() => {
    if (!searchOpen) return undefined;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('.menu-search, .search-results, .details-layer, .popover, .toast-region'))
        return;
      closeSearch();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [searchOpen, closeSearch]);
  const day = plan.days.find((d) => d.date === date) ?? null;
  const kind = dayKind(plan, date, today);
  const structure = useStructure(plan, answers, today, onNotify);
  const replacement = useReplace(plan, answers, today, catalog, onNotify);
  const variants = introVariants(calm);
  const group = (index: number) =>
    intro ? { variants, initial: 'hidden', animate: 'shown', custom: index } : {};

  const soon = useCallback(() => {
    onNotify(menu.demoSoon);
  }, [onNotify]);

  // Marks write into the stored tracking (never into the `?demo=week` overlay).
  const changeTracking = useCallback(
    (
      change: (
        stored: Tracking,
      ) => { ok: true; value: Tracking } | { ok: false; error: TrackingError },
    ) => {
      const store = menuStore();
      const result = change(store.get().tracking);
      if (result.ok) store.update((data) => ({ ...data, tracking: result.value }));
      else onNotify(TRACKING_ERRORS[result.error.code] ?? menu.errors.generic);
    },
    [onNotify],
  );

  const toggleEaten = useCallback(
    (on: string, meal: string, itemId: string, eaten: boolean) => {
      changeTracking((stored) =>
        markEaten(stored, plan, on, meal, itemId, !eaten, new Date().toISOString(), today),
      );
    },
    [changeTracking, plan, today],
  );

  const isEaten = useCallback(
    (slot: SlotRef, itemId: string) =>
      tracking.days[slot.date]?.eaten[markKey(slot.meal, itemId)] !== undefined,
    [tracking],
  );

  /** The dish at a slot as its ⋯ menu and the picker see it, with the reason it cannot change, if any. */
  const dishAt = useCallback(
    (slot: SlotRef, anchor: HTMLElement): DishTarget | null => {
      const planned = plan.days.find((d) => d.date === slot.date)?.meals[slot.meal]?.[slot.index];
      if (!planned) return null;
      return {
        anchor,
        slot,
        itemId: planned.itemId,
        blocked:
          slot.date < today
            ? menu.dish.replacePast
            : isEaten(slot, planned.itemId)
              ? menu.dish.replaceEaten
              : planned.pinnedBy !== undefined
                ? menu.errors.pinned
                : null,
      };
    },
    [plan, today, isEaten],
  );

  const water = useCallback(
    (delta: 1 | -1) => {
      changeTracking((stored) => addWater(stored, date, delta, new Date().toISOString(), today));
    },
    [changeTracking, date, today],
  );

  // A week past the plan's horizon is planned on the way (extendHorizon), up to four weeks ahead (ТЗ фаза 4 §4).
  const selectDate = useCallback(
    (next: string) => {
      const limit = addDays(today, MAX_DAYS_AHEAD);
      if (next > limit) {
        onNotify(menu.week.tooFar);
        return;
      }
      setDate(next);
      setCard(null);
      if (next <= plan.horizonEnd || next < today) return;
      const toDate = [addDays(weekStart(next), 6), limit].sort()[0] ?? limit;
      const store = menuStore();
      const { answers: stored, tracking: storedTracking } = store.get();
      if (!stored) return;
      setExtending(true);
      menuClient()
        .request({
          type: 'apply',
          op: 'extendHorizon',
          answers: stored,
          plan,
          today,
          tracking: storedTracking,
          toDate,
        })
        .then((answer) => {
          if (answer.type === 'plan') store.update((data) => ({ ...data, plan: answer.plan }));
        })
        .catch(() => {
          onNotify(menu.errors.generic);
        })
        .finally(() => {
          setExtending(false);
        });
    },
    [today, plan, onNotify],
  );

  const items = day?.meals[mealId] ?? [];
  const lock = editable(date, today);
  const lockedReason = lock ? (TRACKING_ERRORS[lock.code] ?? menu.errors.generic) : null;
  const closeDishMenu = useCallback(() => {
    setDishMenu(null);
  }, []);
  const closePicker = useCallback(() => {
    setReplacing(null);
  }, []);
  const closeDetails = useCallback(() => {
    setDetails(null);
  }, []);
  const detailsLockCode = details ? editable(details.slot.date, today) : null;
  const detailsLock = detailsLockCode
    ? (TRACKING_ERRORS[detailsLockCode.code] ?? menu.errors.generic)
    : null;
  const unread = letters.some((letter) => !letter.read);

  return (
    <div className="menu-app" data-kiki-open={kikiOpen || undefined}>
      <m.div className="menu-nav-slot" {...group(0)}>
        <Nav avatar={avatar} onHome={onHome} onNotify={onNotify} onAccount={soon} />
      </m.div>
      <main className="menu-main" aria-labelledby="menu-title">
        <m.div className="menu-top-slot" {...group(1)}>
          <TopBar
            answers={answers}
            unread={unread}
            onGoal={soon}
            search={{
              open: searchOpen,
              query,
              listId: SEARCH_LIST,
              activeId: activeKey ? optionId({ key: activeKey }) : null,
              onOpen: openSearch,
              onQuery: (next) => {
                setQuery(next);
                setActiveKey(null);
              },
              onClose: closeSearch,
              onMove: moveFound,
              onEnter: () => {
                const entry = foundEntries.find((e) => e.key === activeKey) ?? foundEntries[0];
                const element = entry ? document.getElementById(optionId(entry)) : null;
                if (entry && element) openFound(entry, element);
              },
            }}
            onMore={soon}
            onBell={soon}
            onKiki={() => {
              setKikiOpen(true);
            }}
          />
        </m.div>
        <m.h1 id="menu-title" className="menu-title" {...group(2)}>
          {menu.title}
        </m.h1>
        <m.div className="menu-week-slot" {...group(3)}>
          <WeekStrip
            plan={plan}
            tracking={tracking}
            today={today}
            date={date}
            onSelect={selectDate}
            onCard={(d, pill) => {
              setCard({ date: d, pill });
            }}
            extending={extending}
          />
        </m.div>
        <m.div className="menu-widgets-slot" {...group(4)}>
          <Widgets
            plan={plan}
            day={day}
            tracking={tracking}
            kind={kind}
            deemphasizeNumbers={deemphasizeNumbers}
            onWater={water}
            onNotify={onNotify}
          />
        </m.div>
        <m.div className="menu-meals-slot" {...group(5)}>
          <MealTabs
            meals={meals}
            selected={mealId}
            onSelect={setMealChoice}
            editing={editing}
            onEdit={setEditing}
            lockOf={structure.lockOf}
            onRemove={structure.remove}
            onAddMeal={structure.add}
            onAddDish={soon}
            onAddWidget={soon}
            onMove={structure.move}
            busy={structure.busy}
          />
        </m.div>
        <m.section
          id="menu-dishes"
          className="dishes"
          aria-label={
            searching ? menu.search.results : meals.find((meal) => meal.id === mealId)?.titleRu
          }
          data-extending={extending || replacement.busy || undefined}
          data-search={searching || undefined}
          {...group(6)}
        >
          {searching ? (
            <SearchResults
              id={SEARCH_LIST}
              query={query}
              result={found.result}
              searching={found.searching}
              plan={plan}
              catalog={catalog}
              today={today}
              activeKey={activeKey}
              onOpen={openFound}
            />
          ) : kind === 'beforeMenu' || !day ? (
            <p className="dishes-note">
              {kind === 'beforeMenu' ? menu.week.beforeMenu : menu.week.extending}
            </p>
          ) : items.length === 0 ? (
            <p className="dishes-note">{menu.dish.empty}</p>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              <m.ul
                key={`${date}:${mealId}`}
                className="dish-row"
                initial={calm ? { opacity: 0 } : { opacity: 0, x: MENU.tab.slidePx }}
                animate={{
                  opacity: 1,
                  x: 0,
                  transition: { duration: MENU.tab.durationS, ease: [0.16, 1, 0.3, 1] },
                }}
                exit={{ opacity: 0, transition: { duration: MENU.tab.durationS / 2 } }}
              >
                {items.map((planned, index) => {
                  const view = catalog.get(planned.itemId);
                  if (!view) return null;
                  const slot = { date, meal: mealId, index };
                  const eaten = isEaten(slot, planned.itemId);
                  return (
                    <li key={`${planned.itemId}:${String(index)}`} className="dish-cell">
                      <DishCard
                        item={view}
                        eaten={eaten}
                        lockedReason={lockedReason}
                        onToggle={() => {
                          if (lockedReason) onNotify(lockedReason);
                          else toggleEaten(date, mealId, planned.itemId, eaten);
                        }}
                        onMore={(anchor) => {
                          setDishMenu(dishAt(slot, anchor));
                        }}
                        onOpen={(card) => {
                          setDetails({ card, slot, itemId: planned.itemId });
                        }}
                        onRecipe={soon}
                      />
                    </li>
                  );
                })}
              </m.ul>
            </AnimatePresence>
          )}
        </m.section>
      </main>
      <m.div className="menu-kiki-slot" {...group(7)}>
        <KikiPanel
          open={kikiOpen}
          onClose={() => {
            setKikiOpen(false);
          }}
          onNotify={onNotify}
        />
      </m.div>
      <button
        type="button"
        className="menu-kiki-fab"
        aria-label={menu.kiki.open}
        onClick={() => {
          setKikiOpen(true);
        }}
      >
        <Pic picture={KIKI} alt="" />
      </button>
      <DishMenu
        target={dishMenu}
        catalog={catalog}
        onClose={closeDishMenu}
        onDetails={(target) => {
          setDishMenu(null);
          setDetails({
            card: target.anchor.closest<HTMLElement>('.dish-card') ?? target.anchor,
            slot: target.slot,
            itemId: target.itemId,
          });
        }}
        onReplaceAi={(target) => {
          setDishMenu(null);
          setReplacing(target);
        }}
        onReplaceSelf={() => {
          setDishMenu(null);
          soon();
        }}
        onBlocked={(reason) => {
          setDishMenu(null);
          onNotify(reason);
        }}
      />
      <ReplacePicker
        target={replacing}
        plan={plan}
        answers={answers}
        catalog={catalog}
        onClose={closePicker}
        onPick={(target, alternative) => {
          setReplacing(null);
          replacement.replace(target.slot, target.itemId, alternative.itemId);
        }}
      />
      <DishDetails
        target={details}
        plan={plan}
        catalog={catalog}
        answers={answers}
        eaten={details ? isEaten(details.slot, details.itemId) : false}
        lockedReason={detailsLock}
        deemphasizeNumbers={deemphasizeNumbers}
        onClose={closeDetails}
        onToggleEaten={() => {
          if (!details) return;
          if (detailsLock) onNotify(detailsLock);
          else
            toggleEaten(
              details.slot.date,
              details.slot.meal,
              details.itemId,
              isEaten(details.slot, details.itemId),
            );
        }}
        onReplace={() => {
          if (!details) return;
          const more = details.card.querySelector<HTMLElement>('.dish-more') ?? details.card;
          const target = dishAt(details.slot, more);
          setDetails(null);
          if (!target) return;
          if (target.blocked) onNotify(target.blocked);
          else setReplacing(target);
        }}
        onRecipe={soon}
      />
      <DayCard
        open={card}
        plan={plan}
        tracking={tracking}
        today={today}
        deemphasizeNumbers={deemphasizeNumbers}
        onClose={() => {
          setCard(null);
        }}
      />
    </div>
  );
}
