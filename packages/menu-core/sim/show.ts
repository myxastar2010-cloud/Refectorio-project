/**
 * One person's menu as text — to read a plan the way a person would: are the meals plausible, the portions sane, the
 * repeats tolerable?
 *   npm run menu:sim -- show --seed 7 [--days 14] [--out <file>]
 * `--seed 0` — the default office worker of the tests with a neutral taste; any other seed — `randomAnswers(seed)`.
 */
import { writeFileSync } from 'node:fs';
import { buildMenuProfile, generate, type PlannedItem } from '../src/index';
import { quizAnswers, randomAnswers, testFoods } from '../src/testing';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const n0 = (x: number | null | undefined) => Math.round(x ?? 0);

function portionText(item: PlannedItem): string {
  const p = item.portion;
  if (p.kind === 'pieces' && p.pieces !== undefined) return ` ${p.pieces} шт.`;
  if (p.kind === 'volume' && p.ml !== undefined) return ` ${p.ml} мл`;
  return p.factor === 1 ? '' : ` ×${String(p.factor).replace('.', ',')}`;
}

const seed = Number(arg('seed', '0'));
const days = Number(arg('days', '14'));
const out = arg('out', '');
const today = arg('today', '2026-11-02');
const foods = testFoods();
const answers = seed === 0 ? quizAnswers() : randomAnswers(seed);
const profile = buildMenuProfile(answers, { foods });
if (!profile.ok) {
  console.log(`seed ${seed}: profile refused — ${JSON.stringify(profile.error)}`);
  process.exit(0);
}
const result = generate({ profile: profile.value, foods, today, seed: seed || 1 });
if (!result.ok) {
  console.log(`seed ${seed}: ${JSON.stringify(result.error).slice(0, 400)}`);
  process.exit(0);
}
const { plan } = result.value;
const t = plan.targets;
const name = (id: string) => foods.byId.get(id)?.nameRu ?? id;
const lines: string[] = [];
const b = answers.body;
lines.push(
  `seed ${seed}: ${b.sex} ${b.ageYears} лет, ${b.heightCm} см, ${b.weightKg} кг · ${answers.diet} · ${answers.macroProfile}` +
    ` · аллергии: ${answers.allergies.items.map((a) => `${a.code}/${a.level}`).join(', ') || 'нет'}` +
    ` · ${answers.health.pregnancy !== 'none' ? answers.health.pregnancy : ''}${answers.health.lactation !== 'none' ? ' кормление' : ''}` +
    ` · цели: ${(answers.extraGoals ?? []).join(', ') || 'нет'}`,
  `цель ${n0(t.energyKcal)} ккал · белок ${n0(t.proteinG.min)}–${n0(t.proteinG.max)} · жиры ${n0(t.fatG.min)}–${n0(t.fatG.max)}` +
    ` · углеводы ${n0(t.carbsG.min)}–${n0(t.carbsG.max)} · клетчатка ≥ ${n0(t.fibreG.min)} · натрий ≤ ${n0(t.sodiumMaxMg)}`,
  `заметки: ${plan.notes.map((x) => x.code).join(', ') || 'нет'}`,
);
for (const day of plan.days.slice(0, days)) {
  const wd = WEEKDAYS[(new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7] ?? '';
  const meals = plan.structure.map((meal) => {
    const items = day.meals[meal.id] ?? [];
    const kcal = items.reduce((s, i) => s + (i.nutrients.energyKcal ?? 0), 0);
    return `${meal.titleRu[0] ?? ''}: ${items.map((i) => name(i.itemId) + portionText(i)).join(' + ')} (${n0(kcal)})`;
  });
  const x = day.totals;
  lines.push(
    `${wd} ${day.date.slice(5)} | ${meals.join(' | ')} | ${n0(x.energyKcal)} ккал Б${n0(x.proteinG)} Ж${n0(x.fatG)} У${n0(x.carbsG)}` +
      ` Кл${n0(x.fibreG)} Na${n0(x.sodiumMg)}${day.flags.length ? ` · ${day.flags.map((f) => f.code + (f.meal ? `@${f.meal}` : '')).join(',')}` : ''}`,
  );
}
const text = lines.join('\n');
if (out) writeFileSync(out, `${text}\n`);
else console.log(text);
