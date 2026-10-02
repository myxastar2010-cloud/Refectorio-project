import { describe, expect, it } from 'vitest';
import { siteContentSchema } from './schema';
import { site } from './site.ru';

describe('site content', () => {
  it('matches the schema', () => {
    expect(siteContentSchema.safeParse(site).success).toBe(true);
  });

  it('has no leading or trailing spaces and no double spaces', () => {
    const strings: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') strings.push(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(site);
    for (const text of strings) {
      expect(text).toBe(text.trim());
      expect(text).not.toMatch(/ {2}/);
    }
  });
});
