// Recipe pilot validator (06 §3). Library: validateRecipe(recipe, inputItem). CLI: node scripts/recipes/validate.mjs <dir>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Recipe } from './schema.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INPUTS = path.resolve(
  APP,
  '..',
  'refectorio-workspace',
  'reports',
  'stage-4',
  'recipe-pilot',
  'inputs.json',
);

const NUTRITION =
  /(^|[^а-яё])(белк(а|и|ов|ом|ами)?|белок|жир(ы|ов|ам|ами)?|углевод\S*|ккал|калори\S*|бжу|полезн\S*)(?![а-яё])/i;
const YO = [
  'ещё',
  'её',
  'зелёный',
  'тёплый',
  'жёлтый',
  'свёкла',
  'тёртый',
  'лёгкий',
  'чёрный',
  'твёрдый',
  'жёсткий',
  'четвёртый',
];
const YO_BAD = YO.map((w) => [new RegExp(`(?<![а-яё])${w.replace(/ё/g, 'е')}(?![а-яё])`, 'i'), w]);
const UNIT_SPACE = new RegExp('\\d [°]?(?:C|мин|ч|г|мл|см|л)(?![а-яёA-Za-z])');

const num = (v) => Math.round(v * 1000) / 1000;
const tokens = (t) => [...t.matchAll(/\{ing:([^}]+)\}/g)].map((m) => m[1]);

// Every Russian text of a variant with a label, for the language checks.
function textsOf(name, variant) {
  const out = [];
  for (const s of variant.steps) {
    out.push([`${s.id}`, s.textRu]);
    if (s.tipRu) out.push([`${s.id}.tip`, s.tipRu]);
  }
  for (const f of ['storage', 'reheat', 'lunchBoxNote']) if (variant[f]) out.push([f, variant[f]]);
  for (const e of variant.equipment) out.push(['equipment', e]);
  for (const i of variant.ingredients) {
    out.push([`${i.key}.name`, i.nameRu]);
    if (i.group) out.push([`${i.key}.group`, i.group]);
    for (const s of i.substitutes) out.push([`${i.key}.sub`, `${s.textRu ?? ''} ${s.noteRu}`]);
  }
  return out;
}

// Which food-safety checks the item needs; each returns true for a step that satisfies it.
function safetyNeeds(item) {
  // «яйцо куриное» is an egg, not poultry
  const meatNames = item.ingredients.map((i) => i.nameRu).filter((n) => !/яйц/i.test(n));
  const names = meatNames.join(' ').toLowerCase() + ' ' + item.nameRu.toLowerCase();
  const eggNames = item.ingredients
    .map((i) => i.nameRu)
    .join(' ')
    .toLowerCase();
  const needs = [];
  if (/(^|[^а-яё])(кур[иы]ц\S*|курин\S*|индейк\S*|утк\S*|утин\S*|птиц\S*)/.test(names))
    needs.push(['poultry', (s) => s.tempC >= 74]);
  if (/фарш/.test(names))
    needs.push(['minced', (s) => s.tempC >= 71 || /сок прозрачн|нет розового/i.test(s.textRu)]);
  if (/рыб|лосос|форел|треск|судак|креветк|морепродукт|кальмар|мид[ии]/.test(names))
    needs.push(['fish', (s) => s.tempC >= 63 || /непрозрачн|делится вилкой/i.test(s.textRu)]);
  if (/яйц/.test(eggNames))
    needs.push([
      'egg',
      (s) => s.tempC >= 71 || /шпажк.*сух|схватил/i.test(s.textRu + ' ' + (s.tipRu ?? '')),
    ]);
  return needs;
}

export function validateRecipe(recipe, item) {
  const errors = [];
  const warnings = [];
  const parsed = Recipe.safeParse(recipe);
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 12))
      errors.push(`schema: ${i.path.join('.')} — ${i.message}`);
    return { errors, warnings };
  }
  const r = parsed.data;
  if (r.itemId !== item.itemId) errors.push(`itemId ${r.itemId} ≠ ${item.itemId}`);
  const gramsOf = new Map(item.ingredients.map((i) => [i.key, i.grams]));

  for (const [vn, v] of Object.entries(r.variants)) {
    const at = (m) => `${vn}: ${m}`;
    const present = new Set();
    for (const ing of v.ingredients) {
      if (!gramsOf.has(ing.key)) errors.push(at(`ingredient ${ing.key} is not in the item's list`));
      else if (num(ing.grams) !== num(gramsOf.get(ing.key)))
        errors.push(at(`${ing.key} grams ${ing.grams} ≠ data ${gramsOf.get(ing.key)}`));
      if (present.has(ing.key)) errors.push(at(`duplicate ingredient ${ing.key}`));
      present.add(ing.key);
    }
    const used = new Set();
    for (const s of v.steps) {
      const inText = new Set(tokens(s.textRu));
      const inKeys = new Set(s.ingredientKeys);
      for (const k of inText)
        if (!inKeys.has(k))
          errors.push(at(`${s.id}: {ing:${k}} in text but not in ingredientKeys`));
      for (const k of inKeys)
        if (!inText.has(k)) errors.push(at(`${s.id}: ${k} in ingredientKeys but no {ing:} token`));
      for (const k of new Set([...inText, ...inKeys])) {
        used.add(k);
        if (!present.has(k))
          errors.push(at(`${s.id}: key ${k} is not an ingredient of this variant`));
      }
      if (s.textRu.length > 220) errors.push(at(`${s.id}: textRu ${s.textRu.length} chars > 220`));
      if (s.tempC !== undefined) {
        const ok = (s.tempC >= 60 && s.tempC <= 100) || (s.tempC >= 140 && s.tempC <= 250);
        if (!ok) errors.push(at(`${s.id}: implausible tempC ${s.tempC}`));
      }
    }
    for (const ing of v.ingredients)
      if (!ing.optional && !used.has(ing.key))
        errors.push(at(`non-optional ${ing.key} is used in no step`));

    if (v.activeTimeMin > v.totalTimeMin)
      errors.push(at(`activeTimeMin ${v.activeTimeMin} > totalTimeMin ${v.totalTimeMin}`));
    const timers = v.steps.reduce((a, s) => a + (s.timerSec ?? 0), 0) / 60;
    if (timers > v.totalTimeMin)
      errors.push(at(`timers sum ${Math.round(timers)} min > totalTimeMin ${v.totalTimeMin}`));
    const [lo, hi] = vn === 'classic' ? [4, 12] : [3, 8];
    if (v.steps.length < lo || v.steps.length > hi)
      errors.push(at(`${v.steps.length} steps, expected ${lo}–${hi}`));

    for (const [id, t] of textsOf(vn, v)) {
      const plain = t.replace(/\{ing:[^}]+\}/g, '');
      if (NUTRITION.test(plain)) errors.push(at(`nutrition wording in ${id}`));
      for (const [re, w] of YO_BAD) if (re.test(plain)) warnings.push(at(`ё: «${w}» in ${id}`));
      if (/"/.test(plain)) warnings.push(at(`straight quotes in ${id}`));
      if (/ - /.test(plain)) warnings.push(at(`spaced hyphen in ${id}`));
      if (UNIT_SPACE.test(plain)) warnings.push(at(`plain space before unit in ${id}`));
      if (/[A-Za-z]{3,}/.test(plain)) warnings.push(at(`English word in ${id}`));
    }

    for (const [kind, ok] of safetyNeeds(item)) {
      if (!v.steps.some((s) => s.safety === true && ok(s)))
        errors.push(at(`no food-safety step for ${kind}`));
    }
    if (item.boxable) {
      if (!v.storage) errors.push(at('boxable without storage'));
      const cold = ['drink', 'salad', 'dessert', 'bread', 'fruit', 'dairy'].includes(item.role);
      const hot = ['main', 'soup', 'side'].includes(item.role) || (item.heat !== 'none' && !cold);
      if (hot && !v.reheat) errors.push(at('boxable hot dish without reheat'));
    }
  }

  const { classic, quick } = r.variants;
  const classicBy = new Map(classic.ingredients.map((i) => [i.key, i]));
  for (const q of quick.ingredients) {
    const c = classicBy.get(q.key);
    if (!c) errors.push(`quick: ${q.key} is not in classic`);
    else if (num(c.grams) !== num(q.grams))
      errors.push(`quick: ${q.key} grams ${q.grams} ≠ classic ${c.grams}`);
  }
  const quickKeys = new Set(quick.ingredients.map((i) => i.key));
  for (const c of classic.ingredients)
    if (!quickKeys.has(c.key) && !c.optional) errors.push(`quick: dropped non-optional ${c.key}`);
  if (quick.totalTimeMin >= classic.totalTimeMin)
    errors.push(`quick.totalTimeMin ${quick.totalTimeMin} ≥ classic ${classic.totalTimeMin}`);
  return { errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] ?? '.');
  const inputs = new Map(JSON.parse(readFileSync(INPUTS, 'utf8')).items.map((i) => [i.itemId, i]));
  const report = {};
  for (const [id, item] of inputs) {
    const file = path.join(dir, `${id}.json`);
    if (!existsSync(file)) {
      report[id] = { missing: true };
      continue;
    }
    try {
      report[id] = validateRecipe(JSON.parse(readFileSync(file, 'utf8')), item);
    } catch (e) {
      report[id] = { errors: [`unreadable JSON: ${e.message}`], warnings: [] };
    }
  }
  writeFileSync(path.join(dir, 'validation.json'), JSON.stringify(report));
  const lines = [];
  let found = 0;
  let valid = 0;
  for (const [id, r] of Object.entries(report)) {
    if (r.missing) {
      lines.push(`${id}: missing`);
      continue;
    }
    found++;
    if (!r.errors.length) valid++;
    lines.push(
      `${id}: ${r.errors.length} err, ${r.warnings.length} warn${r.errors[0] ? ' — ' + r.errors[0].slice(0, 90) : ''}`,
    );
  }
  lines.unshift(`${dir}: ${found}/${inputs.size} files, ${valid} valid`);
  console.log(lines.slice(0, 15).join('\n'));
}
