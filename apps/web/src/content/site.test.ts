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
    expect(all).toContain('ИИ-помощник');
    expect(all).toContain('Ясинский Алексей');
  });

  it('has a 3-line heading, as the composition of part 1 expects', () => {
    expect(site.hero.titleLines).toHaveLength(3);
    expect(site.hero.titleLines.join(' ')).toBe('Форма мечты начинается с тарелки');
  });

  it('shows the three plans of the business model', () => {
    const [free, premium, business] = site.pricing.plans;
    expect(free.price).toBe('0 ₽');
    expect(premium.price).toBe('299 ₽');
    expect(premium.note).toContain('1 990 ₽ в год');
    expect(business.period).toBe('за сотрудника в месяц');
    // No brand names of other services in the plan texts.
    expect(strings(site.pricing).join(' ')).not.toMatch(/Тиндер|Tinder|Купер/);
  });
});
