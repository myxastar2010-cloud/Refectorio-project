import { compareDates, type Plan, type SearchHit, type SearchSpan } from '@refectorio/menu-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MENU } from '../../../motion/tokens';
import { menuClient } from '../engine/client';

/** One card of the results: a found item at one of its places in the plan. */
export type SearchEntry = {
  readonly key: string;
  readonly itemId: string;
  readonly date: string;
  readonly meal: string;
  /** Its index in that meal (the slot the details open). */
  readonly index: number;
  readonly spans: readonly SearchSpan[];
};

export type SearchGroup = {
  readonly date: string;
  readonly meal: string;
  readonly entries: SearchEntry[];
};

/** The id of a result card (the combobox points at it with aria-activedescendant). */
export const optionId = (entry: Pick<SearchEntry, 'key'>) =>
  `search-${entry.key.replaceAll(':', '-')}`;

/** At most this many cards: a broad word («чай») would otherwise fill four weeks. */
export const SEARCH_LIMIT = 36;

/**
 * Today and the days ahead first (by date, then the meal's place in the day), the past after them, latest first; inside
 * a meal — the engine's ranking.
 */
export function groupHits(
  plan: Plan,
  hits: readonly SearchHit[],
  today: string,
): { groups: SearchGroup[]; total: number } {
  const order = new Map(plan.structure.map((meal) => [meal.id, meal.order]));
  const entries: (SearchEntry & { readonly rank: number })[] = [];
  hits.forEach((hit, rank) => {
    for (const place of hit.occurrences) {
      const items = plan.days.find((d) => d.date === place.date)?.meals[place.mealId] ?? [];
      items.forEach((item, index) => {
        if (item.itemId !== hit.itemId) return;
        entries.push({
          key: `${place.date}:${place.mealId}:${String(index)}`,
          itemId: hit.itemId,
          date: place.date,
          meal: place.mealId,
          index,
          spans: hit.spans,
          rank,
        });
      });
    }
  });
  const ahead = (date: string) => compareDates(date, today) >= 0;
  entries.sort((a, b) => {
    const aAhead = ahead(a.date);
    if (aAhead !== ahead(b.date)) return aAhead ? -1 : 1;
    const byDate = aAhead ? compareDates(a.date, b.date) : compareDates(b.date, a.date);
    return (
      byDate ||
      (order.get(a.meal) ?? 0) - (order.get(b.meal) ?? 0) ||
      a.rank - b.rank ||
      a.index - b.index
    );
  });
  const groups: SearchGroup[] = [];
  for (const entry of entries.slice(0, SEARCH_LIMIT)) {
    const last = groups.at(-1);
    if (last && last.date === entry.date && last.meal === entry.meal) last.entries.push(entry);
    else groups.push({ date: entry.date, meal: entry.meal, entries: [entry] });
  }
  return { groups, total: entries.length };
}

/** The engine's search in the worker (ТЗ фаза 4 §9), after a 120 ms pause in typing; a late answer never wins. */
export function useSearch(plan: Plan, query: string, today: string) {
  const [state, setState] = useState<{ query: string; hits: readonly SearchHit[] } | null>(null);
  const seq = useRef(0);
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return undefined;
    seq.current += 1;
    const mine = seq.current;
    const timer = window.setTimeout(() => {
      menuClient()
        .request({ type: 'search', plan, query: trimmed })
        .then((answer) => {
          if (mine === seq.current && answer.type === 'search')
            setState({ query: trimmed, hits: answer.hits });
        })
        .catch(() => {
          if (mine === seq.current) setState({ query: trimmed, hits: [] });
        });
    }, MENU.searchDebounceMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [plan, trimmed]);

  const result = useMemo(
    () => (state ? groupHits(plan, state.hits, today) : null),
    [plan, state, today],
  );
  return {
    /** The results shown (the last answer, even while a newer query is on its way). */
    result: trimmed ? result : null,
    searching: trimmed !== '' && state?.query !== trimmed,
  };
}
