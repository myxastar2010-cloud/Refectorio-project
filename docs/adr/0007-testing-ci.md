# ADR 0007 · Тестирование и CI

- Статус: принято · 02.10.2026
- Связано: `.claude/rules/testing.md`, `.github/workflows/ci.yml`, `lighthouserc*.json`

## Решение

| Уровень | Инструмент | Что проверяет |
|---|---|---|
| Статика | ESLint 10 (typescript-eslint strict type-checked, react-hooks, react-refresh), Prettier, `tsc --noEmit` | ошибки типов, хуков, стиль; 0 предупреждений |
| Юнит | Vitest 5 (проекты `nutrition-core`, `web`), покрытие v8 | формулы по эталонам из первоисточников, граничные значения, свойства; `nutrition-core` ≥ 95% строк, `guardrails` — 100% веток (порог в конфиге) |
| E2E | Playwright 1.63: Chromium, Firefox, WebKit + мобильные профили | сцены, жесты (колесо с инерцией тачпада, свайпы), диалог, фокус, reduced motion, клики по еде |
| Доступность | `@axe-core/playwright` | 0 серьёзных нарушений на обеих сценах и в диалоге (исключение по контрасту задокументировано) |
| Производительность | Lighthouse CI (desktop ≥ 0,95 по 4 категориям; mobile performance ≥ 0,85; LCP ≤ 2 с, CLS ≤ 0,02, TBT ≤ 150 мс) | бюджеты на каждой сборке |
| Сравнение с макетами | `scripts/compare-with-design.mjs` (pixelmatch) | геометрия ключевых элементов ±4 px на 1920×1080 |

- **pre-commit:** husky + lint-staged (ESLint + Prettier на изменённых файлах).
- **CI (`ci.yml`):** `npm ci` → lint → typecheck → unit с покрытием → build → e2e smoke (Chromium) → Lighthouse; при ошибке —
  отчёты как артефакты. Полная матрица браузеров — локально перед публикацией.
- **Деплой:** Render собирает сам из `main`; GitHub Pages — `pages.yml`.
- **Правило:** тест, который падает «иногда», — баг; повторов (retries) нет.

## Особенности окружения

- На этом компьютере загрузчик браузеров Playwright не работает (VPN пропускает только IPv4) — Firefox/WebKit ставятся через
  локальное зеркало (`refectorio-workspace/setup/playwright-mirror-server.js`); в CI это не нужно.
- Lighthouse локально идёт по `http://localhost` → аудит `is-on-https` выключен в конфиге; настоящий HTTPS проверяется на
  опубликованном сайте.
