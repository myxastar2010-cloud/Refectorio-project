import type { ItemView, PlannedItem } from '@refectorio/menu-core';
import { menu } from '../../../content/menu.ru';
import { fill, formatNumber, formatWhole } from '../../../lib/format';

/** This day's portion in words: pieces with their weight, a drink's millilitres, or grams. */
export function portionText(view: ItemView, item: PlannedItem): string {
  const weight = `${formatWhole(item.grams)}\u00a0${menu.units.g}`;
  const { portion } = item;
  if (portion.kind === 'volume' && portion.ml)
    return `${formatWhole(portion.ml)}\u00a0${menu.units.ml}`;
  if (portion.kind === 'pieces' && portion.pieces)
    return fill(menu.details.portionWithCount, {
      amount: `${formatNumber(portion.pieces)}\u00a0${menu.units.pieces}`,
      weight,
    });
  return view.portion.ml !== null && view.role === 'drink'
    ? `${formatWhole(view.portion.ml * portion.factor)}\u00a0${menu.units.ml}`
    : weight;
}
