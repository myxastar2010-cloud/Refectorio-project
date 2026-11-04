import type { QuizAnswersV1 } from '@refectorio/contracts';
import type { NutrientKey } from '@refectorio/food-data';
import type { Plan } from '@refectorio/menu-core';
import { IconChevronLeft, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import { Popover } from '../components/Popover';
import type { Catalog } from '../data/catalog';
import { WIDGET_COLORS, type WidgetColor, type WidgetConfig } from '../store/schema';
import { recommended, WIDGET_GROUPS, widgetName, type WidgetGroup } from './nutrientWidgets';

type Props = {
  readonly anchor: HTMLElement | null;
  readonly answers: QuizAnswersV1 | null;
  readonly plan: Plan;
  readonly catalog: Catalog;
  /** Nutrients that already have a widget (offered again only with another scope). */
  readonly taken: readonly WidgetConfig[];
  readonly onClose: () => void;
  readonly onAdd: (widget: Omit<WidgetConfig, 'id'>) => void;
};

const COLLAGEN = /коллаг|collag/i;

/**
 * «Добавить виджет» (ТЗ фаза 4 §5): search, «Рекомендуем» for this person, then the groups; a nutrient leads to its
 * options — what to count (the day, one meal, the week) and a colour. «Коллаген» gets an honest card instead: no
 * reliable data, try protein and vitamin C, and the plan's dishes with gelatine if there are any.
 */
export function WidgetPicker(props: Props) {
  return (
    <Popover
      anchor={props.anchor}
      label={menu.widgets.custom.picker}
      role="dialog"
      className="popover--picker"
      onClose={props.onClose}
    >
      {props.anchor ? <PickerBody {...props} /> : null}
    </Popover>
  );
}

function PickerBody({ answers, plan, catalog, onAdd }: Props) {
  const c = menu.widgets.custom;
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<NutrientKey | null>(null);
  const [scope, setScope] = useState<WidgetConfig['scope']>('day');
  const meals = [...plan.structure].sort((a, b) => a.order - b.order);
  const [mealId, setMealId] = useState(meals[0]?.id ?? '');
  const [color, setColor] = useState<WidgetColor>('plum');
  const picks = useMemo(() => recommended(answers, plan), [answers, plan]);
  const q = query.trim().toLowerCase();
  const matches = (key: NutrientKey) => !q || widgetName(key).toLowerCase().includes(q);

  const gelatine = useMemo(() => {
    const names = new Set<string>();
    for (const day of plan.days)
      for (const items of Object.values(day.meals))
        for (const item of items) {
          const view = catalog.get(item.itemId);
          if (view?.ingredients.some((i) => /желатин/i.test(i.nameRu))) names.add(view.nameRu);
        }
    return [...names];
  }, [plan, catalog]);

  if (chosen) {
    return (
      <div className="picker">
        <button
          type="button"
          className="picker-back"
          onClick={() => {
            setChosen(null);
          }}
        >
          <IconChevronLeft stroke={2.2} aria-hidden />
          {c.back}
        </button>
        <p className="picker-title">{widgetName(chosen)}</p>
        <fieldset className="picker-field">
          <legend>{c.scope}</legend>
          <div className="picker-options">
            {(['day', 'meal', 'week'] as const).map((s) => (
              <label key={s} className="picker-option">
                <input
                  type="radio"
                  name="widget-scope"
                  checked={scope === s}
                  onChange={() => {
                    setScope(s);
                  }}
                />
                {c.scopes[s]}
              </label>
            ))}
          </div>
        </fieldset>
        {scope === 'meal' ? (
          <label className="picker-field">
            <span>{c.meal}</span>
            <select
              value={mealId}
              onChange={(event) => {
                setMealId(event.target.value);
              }}
            >
              {meals.map((meal) => (
                <option key={meal.id} value={meal.id}>
                  {meal.titleRu}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <fieldset className="picker-field">
          <legend>{c.color}</legend>
          <div className="picker-swatches">
            {WIDGET_COLORS.map((swatch) => (
              <label key={swatch} className="picker-swatch" data-color={swatch}>
                <input
                  type="radio"
                  name="widget-color"
                  checked={color === swatch}
                  aria-label={c.colors[swatch]}
                  onChange={() => {
                    setColor(swatch);
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          className="picker-create"
          onClick={() => {
            onAdd({
              nutrient: chosen,
              scope,
              ...(scope === 'meal' ? { mealId } : {}),
              color,
            });
          }}
        >
          {c.create}
        </button>
      </div>
    );
  }

  const item = (key: NutrientKey) => (
    <li key={key}>
      <button
        type="button"
        className="picker-item"
        onClick={() => {
          setChosen(key);
        }}
      >
        {widgetName(key)}
      </button>
    </li>
  );
  const groups = (Object.keys(WIDGET_GROUPS) as WidgetGroup[])
    .map((group) => ({ group, keys: WIDGET_GROUPS[group].filter(matches) }))
    .filter((g) => g.keys.length > 0);
  const recs = picks.filter(matches);
  const collagen = COLLAGEN.test(q);

  return (
    <div className="picker">
      <p className="picker-title">{c.picker}</p>
      <label className="picker-search">
        <IconSearch stroke={2} aria-hidden />
        <input
          type="search"
          aria-label={c.search}
          placeholder={c.search}
          value={query}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </label>
      <div className="picker-list">
        {collagen ? (
          <div className="picker-card">
            <p className="picker-card-title">{c.collagenTitle}</p>
            <p>{c.collagen}</p>
            {gelatine.length > 0 ? (
              <p>{fill(c.collagenDishes, { list: gelatine.join(', ') })}</p>
            ) : null}
            <ul className="picker-items">{(['proteinG', 'vitaminCMg'] as const).map(item)}</ul>
          </div>
        ) : null}
        {recs.length > 0 ? (
          <section>
            <p className="picker-group">{c.recommended}</p>
            <ul className="picker-items">{recs.map(item)}</ul>
          </section>
        ) : null}
        {groups.map(({ group, keys }) => (
          <section key={group}>
            <p className="picker-group">{c.groups[group]}</p>
            <ul className="picker-items">{keys.map(item)}</ul>
          </section>
        ))}
        {!collagen && groups.length === 0 ? <p className="picker-empty">{c.none}</p> : null}
      </div>
    </div>
  );
}
