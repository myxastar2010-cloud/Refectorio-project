import { describe, expect, it } from 'vitest';
import { extractNumbers, extractQuantities, isGrounded, parseRuNumber } from './numbers';
import {
  correctionPrompt,
  fallbackAnswer,
  IDENTITY_RU,
  sanitizeMarkdown,
  ungroundedNumbers,
  validateAnswer,
  type GroundingSources,
} from './validate';

const src = (toolResults: string[], digest = '', userTexts: string[] = []): GroundingSources => ({
  toolResults,
  digest,
  userTexts,
});

describe('numbers', () => {
  it('parses Russian numbers', () => {
    expect(parseRuNumber('1 500')).toBe(1500);
    expect(parseRuNumber('1 500')).toBe(1500);
    expect(parseRuNumber('1,5')).toBe(1.5);
  });

  it('extracts numbers with units, ranges and words', () => {
    const q = extractQuantities(
      'Блины — 400 ккал, белка 12,5 г; воды 1,5 л; 10–20 % погрешность; 2 порции; 300 калорий.',
    );
    expect(q.map((x) => [x.value, x.unit])).toEqual([
      [400, 'kcal'],
      [12.5, 'g'],
      [1.5, 'l'],
      [10, 'percent'],
      [20, 'percent'],
      [2, 'count'],
      [300, 'kcal'],
    ]);
  });

  it('ignores numbers without units and words that only start like units', () => {
    expect(extractQuantities('67! В 2026 году, 3 лучших блюда, 10.11 в 12:30')).toEqual([]);
  });

  it('reads the pool from JSON and prose', () => {
    expect(extractNumbers('{"kcal":437.6,"g":[1,5]}')).toEqual(
      expect.arrayContaining([437.6, 1.5, 1, 5]),
    );
    expect(extractNumbers('цель 1 800 ккал')).toEqual(expect.arrayContaining([1800]));
  });

  it('accepts display rounding but not other numbers', () => {
    const pool = [437.6, 1512, 1500, 12.46];
    const [kcal] = extractQuantities('438 ккал');
    const [tens] = extractQuantities('440 ккал');
    const [hundreds] = extractQuantities('1 500 ккал');
    const [dec] = extractQuantities('12,5 г');
    const [wrong] = extractQuantities('450 ккал');
    expect(kcal && isGrounded(kcal, pool)).toBe(true);
    expect(tens && isGrounded(tens, pool)).toBe(true);
    expect(hundreds && isGrounded(hundreds, pool)).toBe(true);
    expect(dec && isGrounded(dec, pool)).toBe(true);
    expect(wrong && isGrounded(wrong, pool)).toBe(false);
  });

  it('converts litres to millilitres and allows small counts', () => {
    const [litres] = extractQuantities('1,5 л');
    const [glasses] = extractQuantities('6 стаканов');
    const [many] = extractQuantities('40 порций');
    expect(litres && isGrounded(litres, [1500])).toBe(true);
    expect(glasses && isGrounded(glasses, [])).toBe(true);
    expect(many && isGrounded(many, [])).toBe(false);
  });
});

describe('validateAnswer', () => {
  it('passes the anchor answers', () => {
    expect(validateAnswer('67! Если понадобится помощь с меню — обращайтесь.', src([]))).toEqual(
      [],
    );
    const blini = src([
      '[{"date":"2026-11-13","name":"Блины","kcal":400},{"date":"2026-11-16","name":"Блины","kcal":440}]',
    ]);
    expect(
      validateAnswer(
        'Блины есть в четверг — 400 ккал и в воскресенье — 440 ккал (порция больше). Подробности — во вкладке «КБЖУ».',
        blini,
      ),
    ).toEqual([]);
  });

  it('flags a number the tools never gave', () => {
    const issues = validateAnswer('В блинах около 350 ккал.', src(['{"kcal":400}']));
    expect(issues).toEqual([{ code: 'ungroundedNumber', detail: '350 ккал' }]);
  });

  it('grounds numbers in the digest and the user words', () => {
    expect(
      ungroundedNumbers(
        'Хорошо, ужины — от 20 г белка, цель 1 800 ккал.',
        src([], 'Цель: 1800 ккал', ['хочу ужины минимум с 20 г белка']),
      ),
    ).toEqual([]);
  });

  it('catches vendor names and keeps the identity sentence clean', () => {
    expect(validateAnswer('Я работаю на модели Mistral.', src([]))[0]?.code).toBe('identity');
    expect(validateAnswer('Я не ChatGPT, я Кики.', src([]))[0]?.code).toBe('identity');
    expect(validateAnswer(IDENTITY_RU, src([]))).toEqual([]);
  });

  it('catches diagnoses and dosing, not menu nutrients', () => {
    expect(validateAnswer('Похоже, у вас анемия.', src([]))[0]?.code).toBe('diagnosis');
    expect(validateAnswer('Принимайте витамин D по 2000 МЕ.', src([]))[0]?.code).toBe('dosing');
    expect(
      validateAnswer('Принимайте магний по 400 мг на ночь.', src(['{"x":400}'])).map((i) => i.code),
    ).toContain('dosing');
    expect(validateAnswer('В обеде 900 мг натрия.', src(['{"sodiumMg":900}']))).toEqual([]);
  });

  it('allows only links from the tools and the site', () => {
    expect(validateAnswer('Смотрите https://example.com/x', src([]))[0]?.code).toBe('link');
    expect(
      validateAnswer('Смотрите https://example.com/x', src(['url: https://example.com/x'])),
    ).toEqual([]);
    expect(validateAnswer('Сайт: https://refectorio.onrender.com/#menu', src([]))).toEqual([]);
  });

  it('caps length and asks for Russian', () => {
    expect(validateAnswer('Да. '.repeat(500), src([]))[0]?.code).toBe('tooLong');
    expect(
      validateAnswer(
        'This is an English answer that is long enough to be checked by the rule.',
        src([]),
      )[0]?.code,
    ).toBe('notRussian');
    expect(validateAnswer('  ', src([]))).toEqual([{ code: 'empty' }]);
  });
});

describe('repair texts', () => {
  it('lists the problems for the re-ask', () => {
    const text = correctionPrompt([
      { code: 'ungroundedNumber', detail: '350 ккал' },
      { code: 'identity' },
      { code: 'tooLong' },
      { code: 'diagnosis' },
      { code: 'dosing' },
      { code: 'link' },
      { code: 'notRussian' },
      { code: 'empty' },
    ]);
    expect(text).toContain('350 ккал');
    expect(text).toContain(IDENTITY_RU);
    expect(text.split('\n- ').length).toBe(9);
  });

  it('falls back safely', () => {
    expect(fallbackAnswer([{ code: 'identity' }])).toBe(IDENTITY_RU);
    expect(fallbackAnswer([{ code: 'dosing' }])).toContain('врачу');
    expect(fallbackAnswer([{ code: 'ungroundedNumber' }])).toContain('КБЖУ');
    expect(fallbackAnswer([{ code: 'tooLong' }])).toContain('переформулировать');
  });

  it('strips raw HTML', () => {
    expect(sanitizeMarkdown('<b>Привет</b>\n\n\n<script>x</script>')).toBe('Привет\n\nx');
  });
});
