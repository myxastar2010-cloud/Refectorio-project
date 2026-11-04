import type { QuizAnswersV1 } from '@refectorio/contracts';
import type { DayTargets, ItemView, Plan, PlannedItem, SlotRef } from '@refectorio/menu-core';
import { IconArrowUpRight, IconCheck, IconPlus, IconReplace, IconX } from '@tabler/icons-react';
import { AnimatePresence, m, usePresence } from 'motion/react';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { menu } from '../../../content/menu.ru';
import { useModal } from '../../../components/useModal';
import { fill, formatAmount, formatWhole } from '../../../lib/format';
import { revealMotion, useCornerMorph } from '../../../motion/cornerMorph';
import { useCalmMotion } from '../../../motion/hooks';
import { DURATION } from '../../../motion/tokens';
import { photosFor, PHOTO_SIZES } from '../../quiz/tinder/photos';
import { Segmented } from '../components/Segmented';
import type { Catalog } from '../data/catalog';
import { portionText } from '../data/portion';
import { ROLE_ICONS } from '../dishes/roleIcons';
import { useBackCloses } from '../shell/useBackCloses';
import { dayMonth, weekdayShort } from '../week/dates';
import {
  allergenChecks,
  macroRows,
  microRows,
  MINERALS,
  portionIngredients,
  VITAMINS,
  type Unit,
} from './facts';

/** The dish the panel is about and the card it grows from. */
export type DetailsTarget = {
  readonly card: HTMLElement;
  readonly slot: SlotRef;
  readonly itemId: string;
  /** Where focus goes back (default: the card's title button). */
  readonly returnFocus?: HTMLElement | null;
};

type Props = {
  readonly target: DetailsTarget | null;
  readonly plan: Plan;
  readonly catalog: Catalog;
  readonly answers: QuizAnswersV1 | null;
  readonly eaten: boolean;
  readonly lockedReason: string | null;
  readonly deemphasizeNumbers: boolean;
  readonly onClose: () => void;
  readonly onToggleEaten: () => void;
  readonly onReplace: () => void;
  readonly onRecipe: () => void;
};

type TabId = 'overview' | 'nutrition' | 'ingredients' | 'micros' | 'allergens';

/** Drag the sheet down this far (or flick it) and it closes (phones). */
const DISMISS_PX = 120;
const DISMISS_SPEED = 0.8;

/**
 * The dish in detail (ТЗ фаза 4 §8): a large panel grown from the card by the corner morph — over the main column with
 * a scrim on wide screens, a full-height sheet on phones (drag down to close). Tabs: overview, КБЖУ, ingredients,
 * vitamins and minerals, allergens; with `deemphasizeNumbers` the numeric tabs are gone. Esc, ✕, the scrim and Back
 * close it.
 */
export function DishDetails(props: Props) {
  return createPortal(
    <AnimatePresence>
      {props.target ? (
        <DetailsBody
          key={`${props.target.slot.date}:${props.target.slot.meal}:${props.target.itemId}`}
          {...props}
          target={props.target}
        />
      ) : null}
    </AnimatePresence>,
    document.querySelector('.menu-scene') ?? document.body,
  );
}

const unitText = (unit: Unit) => menu.units[unit];
const amount = (value: number, unit: Unit) =>
  `${unit === 'kcal' ? formatWhole(value) : formatAmount(value)}\u00a0${unitText(unit)}`;
const percent = (share: number) => `${formatWhole(share * 100)}\u00a0%`;

function DetailsBody({
  target,
  plan,
  catalog,
  answers,
  eaten,
  lockedReason,
  deemphasizeNumbers,
  onClose,
  onToggleEaten,
  onReplace,
  onRecipe,
}: Props & { readonly target: DetailsTarget }) {
  const [present, safeToRemove] = usePresence();
  const calm = useCalmMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const anchorRef: RefObject<HTMLElement | null> = useRef(target.card);
  const [revealed, setRevealed] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number } | 'sheet' | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  const view = catalog.get(target.itemId);
  const day = plan.days.find((d) => d.date === target.slot.date);
  const item = day?.meals[target.slot.meal]?.[target.slot.index];
  const meal = plan.structure.find((s) => s.id === target.slot.meal);

  useModal({
    open: present,
    containerRef: panelRef,
    onClose,
    returnFocusTo:
      target.returnFocus ?? target.card.querySelector<HTMLElement>('.dish-open') ?? target.card,
    background: '.menu-app, .menu-kiki-fab',
    fallbackFocusId: 'menu-title',
  });
  useBackCloses(present, onClose, 'details');

  // Wide screens: centred over the main column; phones: the CSS makes it a full-height sheet.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (getComputedStyle(panel).getPropertyValue('--details-sheet').trim() === '1') {
      setBox('sheet');
      return;
    }
    const main = document.querySelector('.menu-main')?.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = panel;
    const margin = 16;
    const centre = main ? main.left + main.width / 2 : window.innerWidth / 2;
    setBox({
      left: Math.min(Math.max(margin, centre - width / 2), window.innerWidth - width - margin),
      top: Math.max(margin, (window.innerHeight - height) / 2),
    });
  }, []);

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

  // Phones: the sheet follows a drag on its grip; far or fast enough — it closes from where it is.
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const onGripDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { y: event.clientY, t: performance.now(), dy: 0 };
    if (panelRef.current) panelRef.current.style.transition = 'none';
  };
  const onGripMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel) return;
    d.dy = Math.max(0, event.clientY - d.y);
    panel.style.transform = `translate3d(0, ${String(d.dy)}px, 0)`;
  };
  const onGripUp = () => {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d || !panel) return;
    const speed = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > DISMISS_PX || speed > DISMISS_SPEED) onClose();
    else {
      panel.style.transition = `transform ${String(DURATION.fade)}s cubic-bezier(0.16, 1, 0.3, 1)`;
      panel.style.transform = '';
    }
  };

  if (!view || !item) return null;
  const tabs: { id: TabId; label: string }[] = (
    [
      { id: 'overview', label: menu.details.tabs.overview },
      { id: 'nutrition', label: menu.details.tabs.nutrition },
      { id: 'ingredients', label: menu.details.tabs.ingredients },
      { id: 'micros', label: menu.details.tabs.micros },
      { id: 'allergens', label: menu.details.tabs.allergens },
    ] as const
  ).filter((t) => !deemphasizeNumbers || (t.id !== 'nutrition' && t.id !== 'micros'));
  const photos = photosFor(view.id);
  const source = photos.sources[0];
  const RoleIcon = ROLE_ICONS[view.role];
  const reveal = (index: number) => revealMotion(index, revealed, calm);
  const titleId = 'dish-details-title';

  return (
    <div className="details-layer" inert={!present}>
      <m.div
        className="details-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: DURATION.scrim } }}
        exit={{ opacity: 0, transition: { duration: DURATION.scrimOut } }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        className="details"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={
          box === null
            ? { visibility: 'hidden' }
            : box === 'sheet'
              ? undefined
              : { left: box.left, top: box.top }
        }
      >
        <div ref={surfaceRef} className="details-surface" aria-hidden />
        <m.header className="details-head" {...reveal(0)}>
          <div className="details-photo" aria-hidden>
            {source ? (
              <picture>
                {source.avifSrcSet ? (
                  <source type="image/avif" srcSet={source.avifSrcSet} sizes={PHOTO_SIZES} />
                ) : null}
                <img src={source.src} srcSet={source.srcSet} sizes={PHOTO_SIZES} alt="" />
              </picture>
            ) : (
              <span className="dish-placeholder" data-role={view.role}>
                <RoleIcon stroke={1.5} />
              </span>
            )}
          </div>
          <div
            className="details-grip"
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            title={menu.details.grip}
            aria-hidden
          />
          <button
            type="button"
            className="details-close"
            aria-label={menu.details.close}
            onClick={onClose}
          >
            <IconX stroke={2.2} aria-hidden />
          </button>
          <div className="details-heading">
            <span className="details-chip">
              {fill(menu.details.chip, {
                day: `${weekdayShort(target.slot.date)}, ${dayMonth(target.slot.date)}`,
                meal: meal?.titleRu ?? '',
              })}
            </span>
            <h2 id={titleId} className="details-title">
              {view.nameRu}
            </h2>
          </div>
        </m.header>
        <m.div className="details-actions" {...reveal(1)}>
          <a
            className="dish-recipe"
            href={`#recipes/${view.id}`}
            onClick={(event) => {
              event.preventDefault();
              onRecipe();
            }}
          >
            {menu.dish.recipe}
            <IconArrowUpRight stroke={2.4} aria-hidden />
          </a>
          <button type="button" className="details-action" onClick={onReplace}>
            <IconReplace stroke={2} aria-hidden />
            {menu.details.replace}
          </button>
          <button
            type="button"
            className="details-action details-eat"
            aria-pressed={eaten}
            aria-disabled={lockedReason !== null || undefined}
            title={lockedReason ?? undefined}
            onClick={onToggleEaten}
          >
            {eaten ? <IconCheck stroke={2.4} aria-hidden /> : <IconPlus stroke={2.4} aria-hidden />}
            {eaten ? menu.details.eaten : menu.details.markEaten}
          </button>
        </m.div>
        <m.div className="details-tabs" {...reveal(2)}>
          <Segmented
            tabs={tabs}
            active={tab}
            onChange={setTab}
            label={menu.details.tabsLabel}
            idBase="details"
          />
        </m.div>
        <m.div
          className="details-panel"
          id="details-panel"
          role="tabpanel"
          aria-labelledby={`details-tab-${tab}`}
          tabIndex={0}
          {...reveal(3)}
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={tab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.18 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              {tab === 'overview' ? (
                <Overview view={view} item={item} deemphasizeNumbers={deemphasizeNumbers} />
              ) : tab === 'nutrition' ? (
                <Nutrition view={view} item={item} targets={plan.targets} />
              ) : tab === 'ingredients' ? (
                <Ingredients view={view} item={item} />
              ) : tab === 'micros' ? (
                <Micros item={item} targets={plan.targets} />
              ) : (
                <Allergens view={view} item={item} answers={answers} />
              )}
            </m.div>
          </AnimatePresence>
        </m.div>
      </div>
    </div>
  );
}

function Overview({
  view,
  item,
  deemphasizeNumbers,
}: {
  readonly view: ItemView;
  readonly item: PlannedItem;
  readonly deemphasizeNumbers: boolean;
}) {
  const n = item.nutrients;
  const macros = [
    { label: menu.details.macros.protein, value: n.proteinG },
    { label: menu.details.macros.fat, value: n.fatG },
    { label: menu.details.macros.carbs, value: n.carbsG },
  ];
  return (
    <div className="details-overview">
      {view.descriptionRu ? (
        // The description continues the name in the game («Блины — тонкие лепёшки…»): here it stands alone.
        <p className="details-text">
          {view.descriptionRu.charAt(0).toUpperCase() + view.descriptionRu.slice(1)}
        </p>
      ) : null}
      <dl className="details-facts">
        <div className="details-fact">
          <dt>{menu.details.portion}</dt>
          <dd>{portionText(view, item)}</dd>
        </div>
        {deemphasizeNumbers ? null : (
          <>
            <div className="details-fact">
              <dt>{menu.details.rows.energy}</dt>
              <dd>{n.energyKcal === null ? menu.details.noData : amount(n.energyKcal, 'kcal')}</dd>
            </div>
            {macros.map((macro) => (
              <div key={macro.label} className="details-fact">
                <dt>{macro.label}</dt>
                <dd>{macro.value === null ? menu.details.noData : amount(macro.value, 'g')}</dd>
              </div>
            ))}
          </>
        )}
      </dl>
      <h3 className="details-subtitle">{menu.details.why}</h3>
      <ul className="details-reasons">
        {item.reasons.map((code) => (
          <li key={code}>
            <IconCheck stroke={2.4} aria-hidden />
            {menu.reasons[code]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Nutrition({
  view,
  item,
  targets,
}: {
  readonly view: ItemView;
  readonly item: PlannedItem;
  readonly targets: DayTargets;
}) {
  const value = (v: number | null, unit: Unit) =>
    v === null ? menu.details.noData : amount(v, unit);
  return (
    <div className="details-table-wrap">
      <table className="details-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">{menu.details.tabs.nutrition}</span>
            </th>
            <th scope="col">{menu.details.perPortion}</th>
            <th scope="col">{menu.details.per100}</th>
            <th scope="col">{menu.details.ofDay}</th>
          </tr>
        </thead>
        <tbody>
          {macroRows(item, view, targets).map((row) => (
            <tr key={row.id} data-sub={row.sub || undefined}>
              <th scope="row">{menu.details.rows[row.id]}</th>
              <td>{value(row.perPortion, row.unit)}</td>
              <td>{value(row.per100, row.unit)}</td>
              <td>{row.share === null ? '—' : percent(row.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="details-note">{menu.details.shareNote}</p>
    </div>
  );
}

function Ingredients({ view, item }: { readonly view: ItemView; readonly item: PlannedItem }) {
  const allergens = [...new Set([...view.allergens, ...view.servingAllergens])];
  return (
    <div className="details-ingredients">
      {allergens.length > 0 ? (
        <p className="details-chips">
          <span className="details-chips-label">{menu.details.contains}:</span>
          {allergens.map((code) => (
            <span key={code} className="details-allergen">
              {menu.allergens[code]}
            </span>
          ))}
        </p>
      ) : null}
      <h3 className="details-subtitle">{menu.details.ingredientsFor}</h3>
      <ul className="details-list">
        {portionIngredients(view, item).map((ingredient) => (
          <li key={ingredient.id}>
            <span>{ingredient.nameRu}</span>
            <span className="details-list-value">
              {ingredient.g < 1
                ? `<\u00a01\u00a0${menu.units.g}`
                : `${formatWhole(ingredient.g)}\u00a0${menu.units.g}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="details-note">{menu.details.ingredientsNote}</p>
    </div>
  );
}

function Micros({ item, targets }: { readonly item: PlannedItem; readonly targets: DayTargets }) {
  const group = (title: string, keys: readonly (typeof VITAMINS)[number][]) => (
    <section className="details-micro-group">
      <h3 className="details-subtitle">{title}</h3>
      <ul className="details-bars">
        {microRows(item, targets, keys).map((row) => (
          <li key={row.key}>
            <span className="details-bar-name">{menu.nutrients[row.key]}</span>
            <span className="details-bar-value">
              {row.value === null
                ? menu.details.noData
                : row.share === null
                  ? `${amount(row.value, row.unit)} · ${menu.details.noNorm}`
                  : `${amount(row.value, row.unit)} · ${percent(row.share)}`}
            </span>
            <span className="details-bar" aria-hidden>
              {row.share === null ? null : (
                <span style={{ transform: `scaleX(${Math.min(1, row.share).toFixed(3)})` }} />
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="details-micros">
      <p className="details-note details-note--top">{menu.details.microsNote}</p>
      {group(menu.details.vitamins, VITAMINS)}
      {group(menu.details.minerals, MINERALS)}
      <p className="details-note">{menu.details.source}</p>
    </div>
  );
}

function Allergens({
  view,
  item,
  answers,
}: {
  readonly view: ItemView;
  readonly item: PlannedItem;
  readonly answers: QuizAnswersV1 | null;
}) {
  const names = (codes: readonly string[]) =>
    codes.map((code) => menu.allergens[code as keyof typeof menu.allergens]).join(', ');
  const { checks, custom } = allergenChecks(answers, view, item);
  const serving = view.servingAllergens.filter((code) => !view.allergens.includes(code));
  const STATE_TEXT = {
    absent: menu.details.yourOk,
    servedWithout: menu.details.yourServedWithout,
    trace: menu.details.yourTrace,
    present: menu.details.yourFound,
  } as const;
  return (
    <div className="details-allergens">
      <section>
        <h3 className="details-subtitle">{menu.details.contains}</h3>
        {view.allergens.length > 0 ? (
          <p className="details-chips">
            {view.allergens.map((code) => (
              <span key={code} className="details-allergen">
                {menu.allergens[code]}
              </span>
            ))}
          </p>
        ) : (
          <p className="details-text">{menu.details.noAllergens}</p>
        )}
      </section>
      {serving.length > 0 ? (
        <section>
          <h3 className="details-subtitle">{menu.details.serving}</h3>
          <p className="details-text">{names(serving)}</p>
          {item.servedWithout?.length ? (
            <p className="details-text">
              {fill(menu.details.servedWithout, { list: names(item.servedWithout) })}
            </p>
          ) : null}
        </section>
      ) : null}
      {view.traces.length > 0 ? (
        <section>
          <h3 className="details-subtitle">{menu.details.traces}</h3>
          <p className="details-text">{names(view.traces)}</p>
        </section>
      ) : null}
      <section>
        <h3 className="details-subtitle">{menu.details.yours}</h3>
        {checks.length === 0 && custom.length === 0 ? (
          <p className="details-text">{menu.details.yoursNone}</p>
        ) : (
          <ul className="details-checks">
            {checks.map((check) => (
              <li key={check.code} data-state={check.state}>
                <b>{menu.allergens[check.code]}</b> — {STATE_TEXT[check.state]}
              </li>
            ))}
          </ul>
        )}
        {custom.length > 0 ? (
          <p className="details-note">
            {fill(menu.details.yourCustom, { text: custom.join(', ') })}
          </p>
        ) : null}
      </section>
    </div>
  );
}
