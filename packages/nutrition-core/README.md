# @refectorio/nutrition-core

Исполняемая спецификация расчётов Refectorio: нормы энергии и нутриентов и правила безопасности (`guardrails`).
Чистый TypeScript — без React, сети и ИИ. Один и тот же код работает в браузере (живой расчёт в тесте) и на сервере (меню).
Научная основа — `refectorio-workspace/research/` (R01–R13, `algorithm-spec.md`), публичная версия — `docs/science/`.

> ⚠ Это не медицинский инструмент. Все числа — оценки (±10–20%), продукт не ставит диагнозы и не заменяет врача.

## Быстрый пример

```ts
import { validateQuestionnaire, evaluateGuardrails, energyTarget, macroTargets } from '@refectorio/nutrition-core';

const input = validateQuestionnaire({ ageYears: 30, sex: 'female', heightCm: 165, weightKg: 60, activity: 'kfa2', goal: 'lose' });
if (!input.ok) throw new Error(input.error.map((e) => `${e.field}: ${e.code}`).join(', '));

const decision = evaluateGuardrails(input.value);     // сначала безопасность
const energy = energyTarget(input.value, decision);   // затем энергия
if (energy.kind !== 'none') {
  const macros = macroTargets(input.value, energy.targetKcal, energy.kind === 'adult' ? energy.goal : 'maintain');
}
```

## API

| Функция | Что делает | Источник |
|---|---|---|
| `validateQuestionnaire(input)` | Диапазоны, перекрёстные проверки, значения по умолчанию → `Result<Questionnaire, InputError[]>` | `algorithm-spec.md` §2 |
| `evaluateGuardrails(q)` | Решение безопасности: `status` (`allowed` → `requiresDoctor` → `limited` → `requiresAdult` → `refused`), причины, доступные цели, запреты, к какому врачу | R08, D-009, §5 |
| `energyTarget(q, decision)` | Энергия: взрослым — BMR × PAL ± темп; детям 3–17 — EER NASEM 2023; до 3 лет и при отказе — без числа | R01, R04 |
| `mifflinStJeorKcal`, `katchMcArdleKcal`, `harrisBenedictRevisedKcal`, `schofieldKcal` | Уравнения основного обмена | R01 §1 |
| `eerChildKcal` | Расчётная потребность детей и подростков 3–18 лет | NASEM 2023 |
| `macroTargets(q, kcal, goal)` | Белок (г/кг), жиры 30%, углеводы — остаток, клетчатка, вода, потолки сахаров и насыщенных жиров | R02, C-05…C-08 |
| `bmiKgM2`, `adultBmiCategory` | ИМТ и категории ВОЗ для взрослых | R05 |
| `lmsZScore`, `lmsValueAtZ`, `childBmiCategory` | z-оценка ИМТ-для-возраста (LMS ВОЗ 2007, коррекция \|z\| > 3) | R05 §2 |

Ошибки ввода — явные значения (`Result`), исключений нет. Единицы — в именах: `weightKg`, `heightCm`, `ageYears`, `…Kcal`, `…G`, `…Ml`.

## Ключевые правила

- **Темп:** снижение по умолчанию 0,5%, максимум 1% массы тела в неделю; набор 0,25% / 0,5% (`RATE_PCT_PER_WEEK`).
  Энергия изменения веса — 7700 ккал/кг (грубая оценка, R04).
- **Нижняя граница:** 1200 ккал (женщины) / 1500 ккал (мужчины и «не указан») — цель не опускается ниже, темп уменьшается;
  < 800 ккал не формируется никогда (`CALORIE_FLOOR_KCAL`, `VLCD_LIMIT_KCAL`).
- **Дети и подростки:** без дефицита и профицита; 1–13 — только через взрослого; < 1 года — отказ; 1–2 года — без
  индивидуального числа энергии; 14–17 — только гостевой режим (данные в браузере).
- **Беременность, лактация, диабет, болезни почек, ФКУ, РПП, варфарин, ингибиторы МАО** — ограниченный режим или отказ
  и направление к врачу (таблица в `algorithm-spec.md` §5.2).

## Данные

| Файл | Что | Источник |
|---|---|---|
| `src/data/mr-2021-energy.json` | PAL групп КФА, PAL 65+, надбавки беременности и лактации | МР 2.3.1.0253-21 |
| `src/data/nasem-2023-eer.json` | Коэффициенты EER детей и подростков, энергия на рост | NASEM 2023 |
| `src/data/macros.json` | Белок г/кг, доли энергии, клетчатка, вода | EFSA, IOM, ВОЗ, ISSN, PROT-AGE |

Таблицы LMS ВОЗ (лицензия CC BY-NC-SA 3.0 IGO) **не входят** в репозиторий — функции z-оценки принимают L, M, S извне
(решение D-010). Статус проверки каждого числа — `refectorio-workspace/research/fact-check.md`.

## Тесты

```
npm test                 # все юнит-тесты
npm run test:coverage    # с покрытием: пакет ≥ 95% строк, guardrails — 100% веток (порог в vitest.config.ts)
```

Тесты — на эталонных примерах из первоисточников (уравнения, примеры ВОЗ для z-оценки), граничных значениях, свойствах
(монотонность, неотрицательность) и эталонных персонах (`src/fixtures/test-personas.json`).
