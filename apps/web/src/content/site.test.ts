import { describe, expect, it } from 'vitest';
import { siteContentSchema } from './schema';
import { site } from './site.ru';

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

describe('site content', () => {
  it('matches the schema', () => {
    const result = siteContentSchema.safeParse(site);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('has no leading/trailing or double spaces', () => {
    for (const text of strings(site)) {
      expect(text).toBe(text.trim());
      expect(text).not.toMatch(/ {2}/);
    }
  });

  it('keeps the mockup typos fixed', () => {
    const all = strings(site).join('\n');
    expect(all).not.toMatch(/настроивайте|то что|ИИ помощник|Ясинский алексей|Название Проекта/);
    expect(all).toContain('ИИ-консультант');
    expect(all).toContain('Ясинский Алексей');
  });

  it('has a 2-line heading and a 3-line lead, as the composition of part 1 expects', () => {
    expect(site.hero.titleLines).toHaveLength(2);
    expect(site.hero.leadLines).toHaveLength(3);
    expect(site.hero.titleLines.join(' ')).toBe('Максимум результата, минимум усилий');
  });

  it('shows the two plans of the mockups, a month and a year of Premium', () => {
    const [free, premium] = site.pricing.plans;
    expect(free.prices.month).toEqual({ amount: '0 ₽', per: 'навсегда' });
    expect(free.prices.year).toEqual(free.prices.month);
    expect(premium.prices.month).toEqual({ amount: '299 ₽', per: 'в месяц' });
    expect(premium.prices.year).toEqual({ amount: '1990 ₽', per: 'в год' });
    // «−44%»: a year costs 44 % less than twelve months (1990 against 12 × 299 = 3588).
    expect(Math.floor((1 - 1990 / (12 * 299)) * 100)).toBe(44);
    expect(site.pricing.periods.yearDiscount).toBe('−44%');
    // No brand names of other services in the plan texts.
    expect(strings(site.pricing).join(' ')).not.toMatch(/Тиндер|Tinder|Купер/);
  });
});
