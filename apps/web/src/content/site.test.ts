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
    expect(all).toContain('выбирайте то, что');
    expect(all).toContain('ИИ-помощник');
    expect(all).toContain('Ясинский Алексей');
  });

  it('has the 3-line heading as in the mockup', () => {
    expect(site.hero.titleLines.join(' ')).toBe('Питаться полезно и вкусно сейчас');
  });
});
