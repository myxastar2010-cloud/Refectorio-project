/** Russian text helpers shared by the quiz and the menu (site conventions: decimal comma, «ёлочки», no-break space). */

/** «{n} год|года|лет» with Intl.PluralRules('ru'). */
const pluralRules = new Intl.PluralRules('ru');
export function pluralRu(n: number, forms: { one: string; few: string; many: string }): string {
  const rule = pluralRules.select(n);
  return rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many;
}

/** Fills «{slot}» placeholders of a content text. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Russian number formatting with a decimal comma (70,5) and a no-break space between thousands (1 500). */
export const formatNumber = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);

const wholeFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
/** A rounded whole number (kcal, grams): «1 520». */
export const formatWhole = (value: number) => wholeFormat.format(Math.round(value));
