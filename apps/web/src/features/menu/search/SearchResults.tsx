import type { Plan, SearchSpan } from '@refectorio/menu-core';
import { compareDates } from '@refectorio/menu-core';
import { Fragment, useEffect, type ReactNode } from 'react';
import { menu } from '../../../content/menu.ru';
import { fill } from '../../../lib/format';
import { photosFor } from '../../quiz/tinder/photos';
import type { Catalog } from '../data/catalog';
import { ROLE_ICONS } from '../dishes/roleIcons';
import { dayMonth, weekdayShort } from '../week/dates';
import { optionId, type SearchEntry, type SearchGroup } from './useSearch';

type Props = {
  readonly id: string;
  readonly query: string;
  readonly result: { readonly groups: SearchGroup[]; readonly total: number } | null;
  readonly searching: boolean;
  readonly plan: Plan;
  readonly catalog: Catalog;
  readonly today: string;
  readonly activeKey: string | null;
  readonly onOpen: (entry: SearchEntry, card: HTMLElement) => void;
};

/** The matched parts of the name in <mark> (the engine's spans on the name field). */
function highlight(text: string, spans: readonly SearchSpan[]): ReactNode {
  const ranges = spans
    .filter((s) => s.field === 'name' && s.end <= text.length && s.start < s.end)
    .sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let at = 0;
  for (const range of ranges) {
    if (range.start < at) continue;
    out.push(
      text.slice(at, range.start),
      <mark key={range.start}>{text.slice(range.start, range.end)}</mark>,
    );
    at = range.end;
  }
  out.push(text.slice(at));
  return out;
}

/**
 * The results in place of the dishes (ТЗ фаза 4 §9): every day and meal of the plan where the words occur, grouped
 * «Чт, 23 июля · Обед», cards outlined in the accent, the matched words marked; an empty state with hints.
 */
export function SearchResults({
  id,
  query,
  result,
  searching,
  plan,
  catalog,
  today,
  activeKey,
  onOpen,
}: Props) {
  useEffect(() => {
    if (activeKey)
      document
        .getElementById(optionId({ key: activeKey }))
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeKey]);

  const titles = new Map(plan.structure.map((meal) => [meal.id, meal.titleRu]));
  const shown = result?.groups.reduce((n, g) => n + g.entries.length, 0) ?? 0;
  const firstPast = result?.groups.findIndex((g) => compareDates(g.date, today) < 0) ?? -1;

  return (
    // A long list scrolls: the region is a Tab stop so the keyboard can scroll it too (the arrows in the field move
    // through the options themselves).
    <div className="search-results" role="region" aria-label={menu.search.results} tabIndex={0}>
      <p className="search-status" role="status">
        {result === null || (searching && shown === 0)
          ? menu.search.searching
          : shown === 0
            ? fill(menu.search.empty, { q: query.trim() })
            : fill(menu.search.count, { n: result.total })}
      </p>
      {result && shown === 0 && !searching ? (
        <p className="search-hints">{menu.search.hints}</p>
      ) : null}
      <div id={id} role="listbox" aria-label={menu.search.results} className="search-list">
        {result?.groups.map((group, index) => {
          const label = fill(menu.search.group, {
            day:
              group.date === today
                ? menu.search.today
                : `${weekdayShort(group.date)}, ${dayMonth(group.date)}`,
            meal: titles.get(group.meal) ?? '',
          });
          return (
            <Fragment key={`${group.date}:${group.meal}`}>
              {index === firstPast ? (
                <p className="search-past" aria-hidden>
                  {menu.search.past}
                </p>
              ) : null}
              <div role="group" aria-label={label} className="search-group">
                <p className="search-group-label" aria-hidden>
                  {label}
                </p>
                <div className="search-grid">
                  {group.entries.map((entry) => {
                    const view = catalog.get(entry.itemId);
                    if (!view) return null;
                    const photo = photosFor(view.id).sources[0];
                    const RoleIcon = ROLE_ICONS[view.role];
                    return (
                      <div
                        key={entry.key}
                        id={optionId(entry)}
                        role="option"
                        aria-selected={activeKey === entry.key}
                        aria-label={view.nameRu}
                        className="search-card"
                        onClick={(event) => {
                          onOpen(entry, event.currentTarget);
                        }}
                      >
                        <span className="search-thumb" aria-hidden>
                          {photo ? (
                            <img
                              src={photo.src}
                              srcSet={photo.srcSet}
                              sizes="72px"
                              alt=""
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                            />
                          ) : (
                            <RoleIcon stroke={1.5} />
                          )}
                        </span>
                        <span className="search-name">{highlight(view.nameRu, entry.spans)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
      {result && result.total > shown ? (
        <p className="search-hints">{fill(menu.search.more, { n: shown })}</p>
      ) : null}
    </div>
  );
}
