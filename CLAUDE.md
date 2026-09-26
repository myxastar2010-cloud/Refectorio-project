# Refectorio — правила кода

Сайт-постановщик целей в питании с ИИ. Команда Modern Manifesto (школа #2107). Открытый код, лицензия MIT.
Документация и общение — на русском; код, идентификаторы и коммиты — на английском.

Главный принцип продукта: **ИИ не считает цифры.** Калории, БЖУ и нормы считает детерминированный код
(`packages/nutrition-core`) по проверенной базе. ИИ только выбирает блюда из отфильтрованного списка и пишет тексты;
валидатор проверяет каждый ответ; при сбое работает алгоритм без ИИ.

## Стек

- Node.js 24 LTS, npm 11 workspaces (без pnpm и yarn).
- `apps/web`: Vite 8 + React 19.3 + TypeScript 6.0 (strict) + Tailwind CSS 4.3 + Motion 13 (`motion/react`, `LazyMotion` + `domMax`).
- Шрифт — Nunito Variable (`@fontsource-variable/nunito`, самохостинг). SF Pro Rounded не встраивать — запрещено лицензией Apple.
- Иконки — Tabler (`@tabler/icons-react`, MIT). Схемы данных — zod 4.
- `packages/nutrition-core`: чистый TypeScript без зависимостей от UI и ИИ.
- Тесты: Vitest 5, Playwright 1.63 (Chromium, Firefox, WebKit), `@axe-core/playwright`, Lighthouse CI.
- Хостинг: Render Static Site (основной, base `/`) и GitHub Pages (зеркало, base `/refectorio/`).

## Команды (из корня `refectorio-app/`)

| Команда | Что делает |
|---|---|
| `npm ci` | установка строго по `package-lock.json` |
| `npm run dev` | дев-сервер сайта (http://localhost:5173) |
| `npm run build` | сборка всех пакетов |
| `npm run lint` / `npm run typecheck` | ESLint (0 предупреждений) / проверка типов |
| `npm test` / `npm run test:coverage` | юнит-тесты Vitest / с покрытием |
| `npm run test:e2e` | e2e Playwright (сам собирает и поднимает `preview`) |
| `npm run format` | Prettier |
| `npm run assets` | пересобрать картинки из `assets-src/` в `apps/web/src/assets/generated/` |
| `npm run lhci` | Lighthouse CI с бюджетами |

Перед коммитом husky запускает lint-staged (ESLint + Prettier на изменённых файлах).

## Структура

```
apps/web/src/
  app/          App.tsx, провайдеры (MotionConfig, LazyMotion), сцены по hash
  scenes/       HeroScene, AboutScene, SceneController (ввод, блокировки, хореография)
  features/     team-dialog (раскрытие карточки команды)
  components/   Button, IconButton, FeatureCard, InfoCard, LinkWithIcon, Carousel, Logo, Toast
  motion/       WaveHover, TiltGlare, токены пружин и длительностей, хуки
  engine/       food-field — движок летающей еды (чистый TS) + тонкая React-обёртка
  content/      site.ru.ts — ВСЕ тексты, ссылки, имена, пути к картинкам (+ zod-схема)
  styles/       tokens.css (дизайн-токены + @theme), globals.css
  assets/generated/  результат `npm run assets` (коммитится)
packages/nutrition-core/  расчёты норм и правила безопасности (guardrails) + тесты
assets-src/     исходные картинки (копии из «Ресурсов»), из них скрипт делает generated
docs/           публичная документация: наука, ADR, дизайн-система
scripts/        служебные Node-скрипты (кросс-платформенные)
```

## Соглашения

- TypeScript strict. `any` запрещён — используй `unknown` и сужение типов; `@ts-ignore` запрещён (`@ts-expect-error` — с причиной).
- Именование: компоненты и типы — `PascalCase`, функции и переменные — `camelCase`, константы — `UPPER_SNAKE_CASE`,
  хуки — `useSomething`, файлы компонентов — `PascalCase.tsx`, остальные — `camelCase.ts`.
- Единицы измерения — в именах или типах: `weightKg`, `heightCm`, `energyKcal`, `durationMs`.
- Ошибки ввода в `nutrition-core` — через явный результат (`{ ok: true, value } | { ok: false, error }`), не исключения.
- Тексты интерфейса — только в `apps/web/src/content/site.ru.ts`. В компонентах текста нет.
- Цвета, размеры, радиусы, z-слои, тайминги — только из токенов (`styles/tokens.css`, `motion/tokens.ts`). Никаких «магических чисел».
- Компоненты маленькие и чистые; состояние анимаций 60 fps (еда, наклон) — не в React state, а в refs и прямой записи `style.transform`.
- Комментарии — только там, где неочевидно «почему».
- Новый компонент: файл в `components/` → тексты в `site.ru.ts` → стили на токенах → состояния hover/focus-visible/active/disabled
  → юнит- или e2e-тест → проверка клавиатурой и с `prefers-reduced-motion`.
- Коммиты — Conventional Commits на английском (`feat(web): …`, `fix(core): …`, `docs: …`, `test: …`, `chore: …`).

## Анимации (подробно — `.claude/rules/motion.md`)

- Анимировать только `transform`, `opacity` и кратко `filter`; `clip-path` — только для волны на небольших элементах.
  Никаких `width`/`height`/`top`/`left`/`margin` в анимациях.
- Всё прерываемо: повторный ввод во время анимации корректно разворачивает её.
- `prefers-reduced-motion` → без дрейфа еды и наклона, только короткие затухания.
- Цель — 60 fps на среднем ноутбуке, ≥45 fps при 4× замедлении CPU, без долгих задач > 50 мс во время анимаций.

## Доступность

- Семантика: `header`, `main`, `section` с заголовками, кнопки — `button`, ссылки — `a`.
- Всё доступно с клавиатуры; фирменный видимый фокус; зоны касания ≥ 44×44 px.
- Неактивная сцена и фон под диалогом — `inert`; декоративная еда — `aria-hidden`.
- axe — 0 серьёзных нарушений. Осознанное исключение: белый мелкий текст на `#E63946` (4,17:1), см. `docs/design-system.md`.

## Запреты

- Не коммитить секреты, `.env*` (кроме `.env.example`), `node_modules`, `dist`.
- Не делать `git push --force`, `git reset --hard` на общих ветках.
- Не менять дизайн «по вкусу»: палитра (`#FEF9F7`, `#E63946`), шрифт, композиция и постоянная фоновая анимация еды заданы макетами.
- Не добавлять вторую анимационную библиотеку (GSAP) без доказанной необходимости.
- ИИ-код не должен выдавать числа КБЖУ — только выбор из списка по ID и тексты.
- Не встраивать шрифты Apple (SF Pro), не использовать картинки без понятной лицензии.
- Не добавлять вход через Google или GitHub (199-ФЗ): только VK ID и Яндекс ID (этап 3).

## Подагенты (`.claude/agents/`)

`science-fact-checker`, `design-reviewer`, `a11y-auditor`, `perf-auditor`, `motion-reviewer` — вызывай для независимой проверки.
