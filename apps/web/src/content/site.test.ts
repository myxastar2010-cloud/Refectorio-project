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
    expect(all).toContain('Кики');
    expect(all).toContain('Ясинский Алексей');
  });

  it('has a 2-line heading and a 4-line lead that names Kiki, as the composition of part 1 expects', () => {
    expect(site.hero.titleLines).toHaveLength(2);
    expect(site.hero.leadLines).toHaveLength(4);
    expect(site.hero.leadLines.join(' ')).toBe(
      'ПроЛанч и ваш личный ИИ Кики возьмут на себя планирование меню. Худейте без диет или просто питайтесь вовремя, даже если весь день не встаёте из-за рабочего стола',
    );
    expect(site.hero.titleLines.join(' ')).toBe('Вкусно питаться, не отвлекаясь от важного');
    expect(site.hero.titleSpoken).toBe(site.hero.titleLines.join(' '));
  });

  it('puts Kiki first and «Ценителям времени» in the middle of the five cards (D-102, D-103)', () => {
    expect(site.hero.features.map((feature) => feature.icon)).toEqual([
      'kiki',
      'listDetails',
      'bolt',
      'mug',
      'trophy',
    ]);
    expect(site.hero.features.map((feature) => feature.title)).toEqual([
      'Кики',
      'Меню за минуту',
      'Ценителям времени',
      'Новые вкусы',
      'Бонусы и уровни',
    ]);
    expect(strings(site).join(' ')).not.toMatch(/кайфожор|торопыж/i);
    expect(site.hero.kiki.lines.length).toBeGreaterThanOrEqual(2);
  });

  it('says «вопросы», not «тест», on the first card, and never calls Kiki a tamagotchi or a dietitian (D-103)', () => {
    const card = site.hero.features[1];
    expect(strings(card).join(' ')).not.toMatch(/тест/i);
    expect(strings(site.hero).join(' ')).not.toMatch(/тамагочи|диетолог|агент|ассистент/i);
    expect(site.brand.logoAlt).toContain('Кики');
  });

  it('calls the product ПроЛанч everywhere: the old name stays only in addresses', () => {
    expect(JSON.stringify(site)).not.toContain('Refectorio');
    expect(site.meta.title).toBe('ПроЛанч — вкусно питаться, не отвлекаясь от важного');
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
