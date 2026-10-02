# Черновик модели данных (этапы 2–3)

> Черновик. Таблицы аккаунтов создаёт Better Auth (`user`, `session`, `account`, `verification`) — здесь только наши.
> Данные о здоровье в БД — только с отдельного согласия (ADR 0003); в гостевом режиме те же структуры живут в браузере.

## Справочники (общие, без персональных данных)

| Таблица | Поля | Заметки |
|---|---|---|
| `ingredient` | `id`, `name_ru`, `source` (`usda_fdc` / `off` / `manual`), `source_ref`, `energy_kcal_100g`, `protein_g_100g`, `fat_g_100g`, `carb_g_100g`, `fiber_g_100g`, `sugar_free_g_100g`, `sodium_mg_100g`, `micros` (JSONB), `allergens` (text[] из 15 кодов R07), `diet_tags` (text[]) | КБЖУ на 100 г; источник у каждого числа (R09) |
| `dish` | `id`, `name_ru`, `meal_types` (завтрак/обед/ужин/перекус), `cook_time_min`, `price_level`, `season`, `trace_risk` (text[]), `recipe_steps` (JSONB), `version` | `allergens` и КБЖУ блюда **вычисляются** из ингредиентов |
| `dish_ingredient` | `dish_id`, `ingredient_id`, `gross_g`, `net_g`, `yield_factor`, `retention_profile` | брутто/нетто и коэффициенты потерь (R09) |
| `norm_table` | `id`, `name` (МР 2.3.1.0253-21 …), `version`, `payload` (JSONB), `source_url` | нормы с источником и версией (дублируют JSON из `nutrition-core`) |

## Пользовательские (только с аккаунтом и согласием)

| Таблица | Поля | Заметки |
|---|---|---|
| `profile` | `user_id`, `birth_year`, `sex` (`male`/`female`/`unspecified`), `height_cm`, `activity_level`, `family_mode` (bool), `consent_health_at`, `consent_version` | без имени и контактов, кроме того, что хранит Better Auth |
| `goal` | `id`, `user_id`, `kind` (`maintain`/`lose`/`gain`/`habits`), `rate_pct_week`, `target_kcal`, `created_at`, `guardrail_action`, `guardrail_reasons` (text[]) | цель + решение guardrails на момент постановки |
| `restriction` | `user_id`, `allergen_code`, `level` (`intolerance`/`allergy`/`severe_allergy`), `diet` (`vegan`/…/`lent_*`/`halal`/`kosher`) | жёсткие фильтры |
| `menu` | `id`, `user_id`, `days` (JSONB: приёмы → `dish_id` + порция), `model` (`deepseek-v4.1-flash` / `algorithm`), `validator_report` (JSONB), `created_at` | ИИ-тексты — отдельно, без чисел |
| `diary_entry` | `id`, `user_id`, `date`, `dish_id` / `custom_kcal`, `portion`, `eaten` (bool) | дневник питания |
| `weight_log` | `user_id`, `date`, `weight_kg` | для адаптивной коррекции (R04: EMA, шаг ≤ 14 дней) |

## Правила

- Удаление аккаунта удаляет все пользовательские строки (каскад) — «право на удаление» по 152-ФЗ.
- Экспорт — JSON со всеми таблицами пользователя.
- Ни одна пользовательская таблица не содержит свободного текста, который уходит в ИИ, кроме «нелюбимых продуктов» (≤ 150 символов).
