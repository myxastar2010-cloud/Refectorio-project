import { describe, expect, it } from 'vitest';
import { normalize, stem, tokenize, withinOneEdit } from './text';

describe('normalize', () => {
  it('lower-cases, folds ё to е and drops punctuation', () => {
    expect(normalize('  Пшённая КАША, с тыквой! ')).toBe('пшенная каша с тыквой');
    expect(normalize('молоко 2,5 %')).toBe('молоко 2 5');
  });

  it('returns an empty string for text without letters', () => {
    expect(normalize('?!…')).toBe('');
  });
});

describe('tokenize', () => {
  it('gives words, stems and spans in the original text', () => {
    const text = 'Куриный суп, ёжик';
    const tokens = tokenize(text);
    expect(tokens.map((t) => t.word)).toEqual(['куриный', 'суп', 'ежик']);
    for (const t of tokens) {
      expect(text.slice(t.start, t.end).toLowerCase().replaceAll('ё', 'е')).toBe(t.word);
      expect(t.stem).toBe(stem(t.word));
    }
  });

  it('keeps digits and Latin letters as words', () => {
    expect(tokenize('Омега 3 и B12').map((t) => t.word)).toEqual(['омега', '3', 'и', 'b12']);
  });

  it('is empty for an empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('stem', () => {
  it('cuts noun endings', () => {
    expect(stem('курица')).toBe('куриц');
    expect(stem('гречка')).toBe('гречк');
    expect(stem('молочка')).toBe(stem('молочку'));
  });

  it('gives one stem to the forms of millet', () => {
    const forms = ['пшённую', 'пшенный', 'пшено'].map(stem);
    expect(new Set(forms).size).toBe(1);
  });

  it('cuts adjective, verb, reflexive and gerund endings', () => {
    expect(stem('куриный')).toBe(stem('куриного'));
    expect(stem('красное')).toBe(stem('красного'));
    expect(stem('мыться')).toBe(stem('мыть'));
    expect(stem('прочитав')).toBe(stem('прочитавши'));
    expect(stem('читаешь')).toBe(stem('читает'));
  });

  it('cuts derivational and superlative endings', () => {
    expect(stem('красивейший').length).toBeLessThan('красивейший'.length - 3);
    expect(stem('конный')).toBe(stem('конная'));
    expect(stem('радость').length).toBeLessThan('радость'.length);
  });

  it('leaves short and non-Cyrillic words unchanged', () => {
    expect(stem('суп')).toBe('суп');
    expect(stem('да')).toBe('да');
    expect(stem('b12')).toBe('b12');
    expect(stem('abc')).toBe('abc');
  });

  it('folds case and ё', () => {
    expect(stem('ЁЖИКИ')).toBe(stem('ежики'));
  });
});

describe('withinOneEdit', () => {
  it('is true for equal words', () => {
    expect(withinOneEdit('гречка', 'гречка')).toBe(true);
  });

  it('accepts one substitution', () => {
    expect(withinOneEdit('гречка', 'гречко')).toBe(true);
  });

  it('accepts one swap of neighbours', () => {
    expect(withinOneEdit('гречка', 'гречак')).toBe(true);
  });

  it('accepts one insertion or deletion', () => {
    expect(withinOneEdit('грибы', 'грибоы')).toBe(true);
    expect(withinOneEdit('грибоы', 'грибы')).toBe(true);
    expect(withinOneEdit('грибы', 'рибы')).toBe(true);
    expect(withinOneEdit('грибы', 'грибыы')).toBe(true);
  });

  it('rejects longer distances', () => {
    expect(withinOneEdit('гречка', 'грецкий')).toBe(false);
    expect(withinOneEdit('гречка', 'гречкааа')).toBe(false);
    expect(withinOneEdit('abcd', 'badc')).toBe(false);
    expect(withinOneEdit('abcd', 'axyd')).toBe(false);
  });
});
