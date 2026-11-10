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
import { fill } from '../../lib/format';
import { useCalmMotion } from '../../motion/hooks';
import { MENU } from '../../motion/tokens';
import { Pic } from './components/Pic';
import type { Catalog } from './data/catalog';
import { KIKI } from './data/pictures';
import { DishCard } from './dishes/DishCard';
import { DishMenu, ReplacePicker, type DishTarget } from './dishes/DishMenu';
import { DishDetails, type DetailsTarget } from './details/DishDetails';
import { cardVariants, rowVariants, useRowSlide } from './dishes/rowMotion';
import { useReplace } from './dishes/useReplace';
import { menuClient } from './engine/client';
import { planError } from './engine/opError';
import { KikiPanel } from './kiki/KikiPanel';
import { chatUi } from '../kiki/uiState';
import { kiki } from '../../content/kiki.ru';
import type { OpenUi } from '@refectorio/kiki-core';
import { MealTabs } from './meals/MealTabs';
import { useStructure } from './meals/useStructure';
import type { Notify } from './notify';
import { AccountMenu } from './shell/AccountMenu';
import { useBackCloses } from './shell/useBackCloses';
import { KIKI_SHEET_MEDIA, useMedia } from './shell/useMedia';
import { useModal } from '../../components/useModal';
import { Nav } from './shell/Nav';
import { Notices } from './shell/Notices';
import { noticesFor } from './shell/noticeRules';
import { readTestParams } from '../../lib/params';
import { setStoredMenu } from '../../lib/menuFlag';
import { deleteAll as deleteQuizAnswers } from '../quiz/flow/persistence';
import { menuStore, parseBackup, useMenu } from './store/store';
import { newLetters } from './news/letters';
import { NewsPanel } from './news/NewsPanel';
import { GoalSheet } from './top/GoalSheet';
import { MoreMenu } from './top/MoreMenu';
import { PrivacySheet } from './shell/PrivacySheet';
import { RestoreSheet } from './top/RestoreSheet';
import { TopBar } from './top/TopBar';
import { usePlanOps } from './top/usePlanOps';
import { Popover } from './components/Popover';
import type { ExportFormat } from './export';
import { DayCard } from './week/DayCard';
import { dayKind } from './week/dates';
import { SearchResults } from './search/SearchResults';
import { optionId, useSearch, type SearchEntry } from './search/useSearch';
import { WeekStrip } from './week/WeekStrip';
import { CustomWidgets } from './widgets/CustomWidgets';
import { widgetName } from './widgets/nutrientWidgets';
import { WidgetPicker } from './widgets/WidgetPicker';
import { Widgets } from './widgets/Widgets';
import { MAX_WIDGETS, type WidgetConfig } from './store/schema';

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
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/** `?demo=week`: the account menu says the synthetic history is on. */
const DEMO_HISTORY = readTestParams(window.location.search).weekDemo;

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
  const settings = useMenu((s) => s.settings);
  const durable = useMenu((s) => s.durable);
  const { avatar } = settings;
  const [accountAt, setAccountAt] = useState<HTMLElement | null>(null);
  const [privacyAt, setPrivacyAt] = useState<HTMLElement | null>(null);
  const [wipeAt, setWipeAt] = useState<HTMLElement | null>(null);
  const letters = useMenu((s) => s.letters);
  const customWidgets = useMenu((s) => s.widgets);
  const [pickerAt, setPickerAt] = useState<HTMLElement | null>(null);
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
  // Below 1280 px Kiki is a sheet: a dialog while open, out of reach (inert) while closed (ТЗ фаза 4 §2).
  const kikiSheet = useMedia(KIKI_SHEET_MEDIA);
  const kikiRef = useRef<HTMLDivElement>(null);
  const [kikiOpener, setKikiOpener] = useState<HTMLElement | null>(null);
  /** «Заменить с ИИ»: a request the chat sends once it is ready (key: a new request each time). */
  const [kikiRequest, setKikiRequest] = useState<{ text: string; key: number } | null>(null);
  // The opener gets the focus back on close: the button itself when known (Safari does not focus a clicked button).
  const openKiki = useCallback((opener?: HTMLElement) => {
    setKikiOpener(
      opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
    );
    setKikiOpen(true);
  }, []);
  const closeKiki = useCallback(() => {
    setKikiOpen(false);
  }, []);
  useModal({
    open: kikiSheet && kikiOpen,
    containerRef: kikiRef,
    onClose: closeKiki,
    returnFocusTo: kikiOpener,
    background: '.menu-nav-slot, .menu-main, .menu-kiki-fab',
    fallbackFocusId: 'menu-title',
  });
  useBackCloses(kikiSheet && kikiOpen, closeKiki, 'kiki');
  const [card, setCard] = useState<{ date: string; pill: HTMLElement } | null>(null);
  const [extending, setExtending] = useState(false);
  const [dishMenu, setDishMenu] = useState<DishTarget | null>(null);
  const [replacing, setReplacing] = useState<DishTarget | null>(null);
  const [details, setDetails] = useState<DetailsTarget | null>(null);
  const [moreAt, setMoreAt] = useState<HTMLElement | null>(null);
  const [goalAt, setGoalAt] = useState<HTMLElement | null>(null);
  const [confirmAt, setConfirmAt] = useState<HTMLElement | null>(null);
  const [restoring, setRestoring] = useState<{
    anchor: HTMLElement;
    backup: Extract<ReturnType<typeof parseBackup>, { ok: true }>['backup'];
    file: unknown;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ops = usePlanOps(plan, today, onNotify);
  const [news, setNews] = useState<{ anchor: HTMLElement; pinned: boolean; keys: boolean } | null>(
    null,
  );
  const newsTimer = useRef<number | undefined>(undefined);
  const newsLater = useCallback((run: () => void, ms: number) => {
    window.clearTimeout(newsTimer.current);
    newsTimer.current = window.setTimeout(run, ms);
  }, []);
  const closeNews = useCallback(() => {
    window.clearTimeout(newsTimer.current);
    setNews(null);
  }, []);

  // Letters are written on opening the app: the welcome pair once, then at most one a day (ТЗ фаза 4 §11).
  useEffect(() => {
    const store = menuStore();
    const data = store.get();
    if (!data.plan) return;
    const { letters: added, lastLetterDay } = newLetters(
      {
        plan: data.plan,
        tracking: data.tracking,
        letters: data.letters,
        settings: data.settings,
        today,
        deemphasizeNumbers: data.answers?.guardrails.deemphasizeNumbers ?? false,
      },
      new Date(),
      Math.random,
    );
    if (added.length === 0) return;
    store.update((d) => ({
      ...d,
      letters: [...d.letters, ...added],
      settings: { ...d.settings, lastLetterDay },
    }));
  }, [today]);
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

  /** The empty chat's suggestions from the person's own day (ТЗ 07 §10). */
  const kikiSuggestions = useMemo(() => {
    const day = plan.days.find((d) => d.date === today);
    const dinner = meals.find((m) => m.kind === 'dinner') ?? meals.at(-1);
    const lunchItem = day?.meals[meals.find((m) => m.kind === 'lunch')?.id ?? '']?.[0];
    const out = [
      ...(dinner ? [fill(kiki.suggestions.today, { meal: dinner.titleRu.toLowerCase() })] : []),
      kiki.suggestions.fish,
    ];
    const dish = lunchItem ? catalog.get(lunchItem.itemId)?.nameRu : undefined;
    if (dish) out.push(fill(kiki.suggestions.swap, { dish }));
    return out;
  }, [plan.days, today, meals, catalog]);

  /** «Открыть …» buttons in Kiki's answers (they never navigate by themselves; ТЗ 07 §6). */
  const openFromKiki = useCallback(
    (ui: OpenUi) => {
      const anchor = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const firstDateOf = (itemId: string) =>
        plan.days.find(
          (d) =>
            d.date >= today &&
            Object.values(d.meals).some((items) => items.some((i) => i.itemId === itemId)),
        )?.date;
      if (kikiSheet) closeKiki();
      switch (ui.target) {
        case 'day':
          if (ui.id && plan.days.some((d) => d.date === ui.id)) setDate(ui.id);
          return;
        case 'dish': {
          const at = ui.id ? firstDateOf(ui.id) : undefined;
          if (at) setDate(at);
          return;
        }
        case 'search':
          openSearch();
          return;
        case 'goal':
          setGoalAt(anchor);
          return;
        case 'download':
        case 'restore':
          setMoreAt(anchor);
          return;
        case 'widgets':
          setPickerAt(anchor);
          return;
        case 'mealEdit':
          setEditing(true);
          return;
        case 'news':
          if (anchor) setNews({ anchor, pinned: true, keys: false });
          return;
        case 'account':
          setAccountAt(anchor);
          return;
        case 'privacy':
          setPrivacyAt(anchor);
          return;
        case 'recipes':
          soon();
          return;
      }
    },
    [plan.days, today, kikiSheet, closeKiki, openSearch, soon],
  );

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

  // The person came back after the plan's horizon (two weeks and more): it is re-planned from today on its own —
  // past days and marks stay (regenerate keeps them). Shown as «Собираем меню…» until it lands; a refusal says why.
  const healing = useRef<Plan | null>(null);
  const [healFailed, setHealFailed] = useState<Plan | null>(null);
  const horizonPast = plan.horizonEnd < today;
  useEffect(() => {
    if (!horizonPast || healing.current === plan) return;
    const store = menuStore();
    const { answers: stored, tracking: storedTracking } = store.get();
    if (!stored) return;
    healing.current = plan;
    menuClient()
      .request({
        type: 'apply',
        op: 'regenerate',
        answers: stored,
        plan,
        today,
        tracking: storedTracking,
      })
      .then((answer) => {
        if (answer.type === 'plan') store.commitPlanIf(plan, answer.plan);
      })
      .catch((error: unknown) => {
        setHealFailed(plan);
        onNotify(planError(error));
      });
  }, [horizonPast, plan, today, onNotify]);
  const gathering = extending || (horizonPast && healFailed !== plan);

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
          // Only onto the plan it was planned from (another operation may have replaced it meanwhile).
          if (answer.type === 'plan')
            store.update((data) => (data.plan === plan ? { ...data, plan: answer.plan } : data));
        })
        .catch((error: unknown) => {
          onNotify(planError(error));
        })
        .finally(() => {
          setExtending(false);
        });
    },
    [today, plan, onNotify],
  );

  const items = day?.meals[mealId] ?? [];
  const rowSlide = useRowSlide(
    date,
    mealId,
    meals.findIndex((meal) => meal.id === mealId),
  );
  const rowMotion = useMemo(() => rowVariants(calm), [calm]);
  const cardMotion = useMemo(() => cardVariants(calm), [calm]);
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

  const moveWidget = useCallback((id: string, delta: -1 | 1) => {
    menuStore().update((d) => {
      const at = d.widgets.findIndex((w) => w.id === id);
      const to = at + delta;
      if (at < 0 || to < 0 || to >= d.widgets.length) return d;
      const next = [...d.widgets];
      const [moved] = next.splice(at, 1);
      if (moved) next.splice(to, 0, moved);
      return { ...d, widgets: next };
    });
  }, []);
  const removeWidget = useCallback(
    (widget: WidgetConfig) => {
      const store = menuStore();
      const index = store.get().widgets.findIndex((w) => w.id === widget.id);
      store.update((d) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== widget.id) }));
      onNotify(fill(menu.widgets.custom.removed, { name: widgetName(widget.nutrient) }), {
        label: menu.meals.undo,
        // Back to its place, keeping whatever changed since (a widget added meanwhile stays).
        run: () => {
          store.update((d) =>
            d.widgets.some((w) => w.id === widget.id) || d.widgets.length >= MAX_WIDGETS
              ? d
              : {
                  ...d,
                  widgets: [...d.widgets.slice(0, index), widget, ...d.widgets.slice(index)],
                },
          );
        },
      });
    },
    [onNotify],
  );
  const closeAccount = useCallback(() => {
    setAccountAt(null);
  }, []);
  const closeMore = useCallback(() => {
    setMoreAt(null);
  }, []);
  const closeGoal = useCallback(() => {
    setGoalAt(null);
  }, []);
  const closeRestore = useCallback(() => {
    setRestoring(null);
  }, []);

  /** A download of the visible week: the export chunk renders it (ТЗ фаза 4 §10). */
  const download = useCallback(
    (format: ExportFormat) => {
      const store = menuStore();
      onNotify(menu.export.preparing);
      import('./export')
        .then(({ renderExport, saveFile }) =>
          renderExport({
            format,
            plan,
            catalog,
            answers,
            date,
            landscape: window.innerWidth > window.innerHeight,
            backup: () => store.backup(),
          }).then(async ({ blob, name }) => {
            await saveFile(blob, name);
            onNotify(fill(menu.export.saved, { name }));
          }),
        )
        .catch((error: unknown) => {
          // The person closed the share sheet: nothing to report.
          if (error instanceof DOMException && error.name === 'AbortError') return;
          onNotify(menu.export.failed);
        });
    },
    [plan, catalog, answers, date, onNotify],
  );

  /** «Загрузить меню из файла»: read, check its format and version, then show what it holds before replacing. */
  const readBackup = useCallback(
    (file: File) => {
      // A backup of a few months weighs a few hundred kilobytes: anything far bigger is not one (and would stall the page).
      if (file.size > MAX_BACKUP_BYTES) {
        onNotify(menu.restore.format);
        return;
      }
      file
        .text()
        .then((text) => {
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            onNotify(menu.restore.format);
            return;
          }
          const parsed = parseBackup(json);
          if (!parsed.ok) {
            onNotify(parsed.reason === 'version' ? menu.restore.version : menu.restore.format);
            return;
          }
          const anchor = document.querySelector<HTMLElement>('.menu-top .menu-round');
          if (anchor) setRestoring({ anchor, backup: parsed.backup, file: json });
        })
        .catch(() => {
          onNotify(menu.restore.format);
        });
    },
    [onNotify],
  );

  return (
    <div className="menu-app" data-kiki-open={kikiOpen || undefined}>
      <m.div className="menu-nav-slot" {...group(0)}>
        <Nav avatar={avatar} onHome={onHome} onNotify={onNotify} onAccount={setAccountAt} />
      </m.div>
      <main className="menu-main" aria-labelledby="menu-title">
        <m.div className="menu-top-slot" {...group(1)}>
          <TopBar
            answers={answers}
            unread={unread}
            onGoal={setGoalAt}
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
            onMore={setMoreAt}
            newsOpen={news !== null}
            widgets={
              <CustomWidgets
                widgets={customWidgets}
                plan={plan}
                tracking={tracking}
                date={date}
                editing={editing}
                deemphasizeNumbers={deemphasizeNumbers}
                onMove={moveWidget}
                onRemove={removeWidget}
              />
            }
            onBell={(bell, keyboard) => {
              window.clearTimeout(newsTimer.current);
              setNews((now) =>
                now?.pinned ? null : { anchor: bell, pinned: true, keys: keyboard },
              );
            }}
            onBellHover={(bell) => {
              if (bell)
                newsLater(() => {
                  setNews((now) => now ?? { anchor: bell, pinned: false, keys: false });
                }, MENU.hoverIntentMs);
              else
                newsLater(() => {
                  setNews((now) => (now?.pinned ? now : null));
                }, MENU.popover.submenuCloseMs);
            }}
            onKiki={() => {
              openKiki();
            }}
          />
        </m.div>
        <m.h1 id="menu-title" className="menu-title" {...group(2)}>
          {menu.title}
        </m.h1>
        <m.div className="menu-notices-slot" {...group(2)}>
          <Notices
            notices={noticesFor(answers, plan, settings, durable)}
            onDownload={() => {
              download('json');
            }}
            onClose={(id) => {
              menuStore().update((d) => ({
                ...d,
                settings:
                  id === 'storage'
                    ? { ...d.settings, noticeSeen: true }
                    : { ...d.settings, dismissedNotes: [...d.settings.dismissedNotes, id] },
              }));
            }}
          />
        </m.div>
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
            onAddWidget={() => {
              if (customWidgets.length >= MAX_WIDGETS) onNotify(menu.widgets.custom.full);
              else setPickerAt(document.querySelector<HTMLElement>('.meal-add'));
            }}
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
          data-extending={gathering || replacement.busy || undefined}
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
              {kind === 'beforeMenu'
                ? menu.week.beforeMenu
                : gathering
                  ? menu.week.extending
                  : menu.week.notPlanned}
            </p>
          ) : items.length === 0 ? (
            <p className="dishes-note">{menu.dish.empty}</p>
          ) : (
            <AnimatePresence mode="popLayout" initial={false} custom={rowSlide}>
              <m.ul
                key={`${date}:${mealId}`}
                className="dish-row"
                variants={rowMotion}
                custom={rowSlide}
                initial="enter"
                animate="show"
                exit="exit"
              >
                {items.map((planned, index) => {
                  const view = catalog.get(planned.itemId);
                  if (!view) return null;
                  const slot = { date, meal: mealId, index };
                  const eaten = isEaten(slot, planned.itemId);
                  return (
                    <m.li
                      key={`${planned.itemId}:${String(index)}`}
                      className="dish-cell"
                      variants={cardMotion}
                      custom={rowSlide}
                    >
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
                    </m.li>
                  );
                })}
              </m.ul>
            </AnimatePresence>
          )}
        </m.section>
      </main>
      {/* The intro moves an inner box: the slot's own transform is the sheet's (CSS), never an inline style. */}
      <div
        ref={kikiRef}
        className="menu-kiki-slot"
        role={kikiSheet && kikiOpen ? 'dialog' : undefined}
        aria-modal={(kikiSheet && kikiOpen) || undefined}
        aria-label={kikiSheet && kikiOpen ? menu.kiki.label : undefined}
        inert={kikiSheet && !kikiOpen}
      >
        <m.div className="menu-kiki-intro" {...group(7)}>
          <KikiPanel
            open={kikiOpen}
            onClose={closeKiki}
            onNotify={onNotify}
            catalog={catalog}
            deemphasizeNumbers={deemphasizeNumbers}
            hasMenu={answers !== null}
            selectedDate={date}
            today={today}
            suggestions={kikiSuggestions}
            onOpen={openFromKiki}
            request={kikiRequest}
          />
        </m.div>
      </div>
      <button
        type="button"
        className="menu-kiki-fab"
        aria-label={menu.kiki.open}
        onClick={(event) => {
          openKiki(event.currentTarget);
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
          // Through Kiki when the network is there (ТЗ 07 §10); offline — the engine's own ranked list (phase 4).
          if (!navigator.onLine) {
            setReplacing(target);
            return;
          }
          chatUi.replaceSlot = {
            date: target.slot.date,
            mealId: target.slot.meal,
            itemId: target.itemId,
          };
          setKikiRequest({
            text: fill(kiki.suggestions.swap, { dish: catalog.get(target.itemId)?.nameRu ?? '' }),
            key: Date.now(),
          });
          openKiki(target.anchor);
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
          // The slot is held by its index: if the plan changed while the choice was open, it may hold another dish.
          const now = plan.days.find((d) => d.date === target.slot.date)?.meals[target.slot.meal]?.[
            target.slot.index
          ];
          if (now?.itemId !== target.itemId) onNotify(menu.errors.changed);
          else replacement.replace(target.slot, target.itemId, alternative.itemId);
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
      <WidgetPicker
        anchor={pickerAt}
        answers={answers}
        plan={plan}
        catalog={catalog}
        taken={customWidgets}
        onClose={() => {
          setPickerAt(null);
        }}
        onAdd={(widget) => {
          setPickerAt(null);
          menuStore().update((d) =>
            d.widgets.length >= MAX_WIDGETS
              ? d
              : { ...d, widgets: [...d.widgets, { ...widget, id: `w-${String(Date.now())}` }] },
          );
          onNotify(fill(menu.widgets.custom.added, { name: widgetName(widget.nutrient) }));
        }}
      />
      <AccountMenu
        anchor={accountAt}
        avatar={avatar}
        dailyDigest={settings.dailyDigest}
        demoHistory={DEMO_HISTORY}
        onClose={closeAccount}
        onAvatar={(index) => {
          menuStore().update((d) => ({ ...d, settings: { ...d.settings, avatar: index } }));
        }}
        onNotifications={() => {
          const bell = document.querySelector<HTMLElement>('.menu-bell');
          closeAccount();
          if (bell) setNews({ anchor: bell, pinned: true, keys: true });
        }}
        onDigest={(on) => {
          menuStore().update((d) => ({ ...d, settings: { ...d.settings, dailyDigest: on } }));
        }}
        onSupport={() => {
          closeAccount();
          openKiki();
        }}
        onPrivacy={() => {
          const anchor = accountAt;
          closeAccount();
          setPrivacyAt(anchor);
        }}
        onDownload={() => {
          closeAccount();
          download('json');
        }}
        onWipe={() => {
          const anchor = accountAt;
          closeAccount();
          setWipeAt(anchor);
        }}
        onLogin={() => {
          closeAccount();
          onNotify(menu.demoSoon);
        }}
      />
      <Popover
        anchor={wipeAt}
        label={menu.account.wipe}
        role="alertdialog"
        onClose={() => {
          setWipeAt(null);
        }}
      >
        <div className="meal-confirm">
          <p>{menu.account.wipeConfirm}</p>
          <div className="meal-confirm-actions">
            <button
              type="button"
              className="menu-pill menu-pill--danger"
              onClick={() => {
                setWipeAt(null);
                void menuStore()
                  .wipe()
                  .then(() => {
                    // Everything this browser keeps about the person: the quiz answers (health, weight)
                    // and the landing's «есть меню» flag go too. The demo's own database leaves them alone.
                    if (!readTestParams(window.location.search).menuDemo) {
                      deleteQuizAnswers();
                      setStoredMenu(false);
                    }
                    onNotify(menu.account.wipeDone);
                    onHome();
                  });
              }}
            >
              {menu.account.wipeYes}
            </button>
            <button
              type="button"
              // The least harmful choice comes first (a stray Enter only cancels).
              data-autofocus
              className="menu-pill menu-pill--ghost"
              onClick={() => {
                setWipeAt(null);
              }}
            >
              {menu.meals.confirmNo}
            </button>
          </div>
        </div>
      </Popover>
      <NewsPanel
        anchor={news?.anchor ?? null}
        focusFirst={news?.keys ?? false}
        letters={letters}
        plan={plan}
        today={today}
        deemphasizeNumbers={deemphasizeNumbers}
        onClose={closeNews}
        onPointerEnter={() => {
          window.clearTimeout(newsTimer.current);
        }}
        onPointerLeave={() => {
          newsLater(() => {
            setNews((now) => (now?.pinned ? now : null));
          }, MENU.popover.submenuCloseMs);
        }}
        onRead={(ids) => {
          menuStore().update((d) => ({
            ...d,
            letters: d.letters.map((l) => (ids.includes(l.id) ? { ...l, read: true } : l)),
          }));
        }}
        onAskKiki={() => {
          closeNews();
          openKiki();
        }}
        onDownload={() => {
          closeNews();
          download('json');
        }}
      />
      <MoreMenu
        anchor={moreAt}
        onClose={closeMore}
        onGoal={() => {
          const pill = document.querySelector<HTMLElement>('.menu-goal');
          setMoreAt(null);
          setGoalAt(pill);
        }}
        onRegenerate={() => {
          const anchor = moreAt;
          setMoreAt(null);
          setConfirmAt(anchor);
        }}
        onDownload={(format) => {
          setMoreAt(null);
          download(format);
        }}
        onRestore={() => {
          setMoreAt(null);
          fileInput.current?.click();
        }}
      />
      <Popover
        anchor={confirmAt}
        label={menu.more.regenerate}
        role="alertdialog"
        onClose={() => {
          setConfirmAt(null);
        }}
      >
        <div className="meal-confirm">
          <p>{menu.more.regenerateConfirm}</p>
          <div className="meal-confirm-actions">
            <button
              type="button"
              className="menu-pill menu-pill--accent"
              disabled={ops.busy}
              onClick={() => {
                setConfirmAt(null);
                ops.regenerate();
              }}
            >
              {menu.more.regenerateYes}
            </button>
            <button
              type="button"
              // The least harmful choice comes first (a stray Enter only cancels).
              data-autofocus
              className="menu-pill menu-pill--ghost"
              onClick={() => {
                setConfirmAt(null);
              }}
            >
              {menu.meals.confirmNo}
            </button>
          </div>
        </div>
      </Popover>
      <GoalSheet
        anchor={goalAt}
        answers={answers}
        plan={plan}
        busy={ops.busy}
        onClose={closeGoal}
        onApply={(next) => {
          ops.changeGoal(next, closeGoal);
        }}
      />
      <PrivacySheet
        anchor={privacyAt}
        onClose={() => {
          setPrivacyAt(null);
        }}
      />
      <RestoreSheet
        anchor={restoring?.anchor ?? null}
        backup={restoring?.backup ?? null}
        onClose={closeRestore}
        onApply={() => {
          const file = restoring?.file;
          setRestoring(null);
          const result = menuStore().restore(file);
          onNotify(
            result.ok
              ? menu.restore.done
              : result.reason === 'version'
                ? menu.restore.version
                : menu.restore.format,
          );
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) readBackup(file);
        }}
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
