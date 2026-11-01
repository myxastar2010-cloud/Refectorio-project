# ПроЛанч (бывший Refectorio) — правила кода

ПроЛанч — ИИ-платформа персонального питания для офисных сотрудников: рацион на неделю, ланч-боксы, диетолог Кики.
Команда Modern Manifesto (школа #2107). Открытый код, лицензия MIT.
Документация и общение — на русском; код, идентификаторы и коммиты — на английском.

Бренд сменился только там, где его видит пользователь. Адрес `refectorio.onrender.com`, имя репозитория, пакеты
`@refectorio/*`, ключи хранилища `refectorio.*` и другие внутренние идентификаторы остаются (D-060).

Главный принцип продукта: **ИИ не считает цифры.** Калории, БЖУ, нормы и меню считает детерминированный код
(`packages/nutrition-core`, `packages/menu-core`) по проверенным данным. Кики превращает просьбу пользователя в
проверяемые вызовы инструментов и пишет тексты. Числа она получает только из инструментов и сводки контекста;
валидатор проверяет каждое число с единицей в её ответе, все изменения — предложения, которые применяет сам
пользователь; при сбое работает алгоритм без ИИ.

## Стек

- Node.js 24 LTS, npm 11 workspaces (без pnpm и yarn).
- `apps/web`: Vite 8 + React 19.3 + TypeScript 6.0 (strict) + Tailwind CSS 4.3 + Motion 13 (`motion/react`, `LazyMotion` + `domAnimation`).
- Шрифт — Open Runde (скруглённый Inter, OFL; подмножества латиница + кириллица в `apps/web/src/assets/fonts/`, `npm run fonts`).
  SF Pro Rounded не встраивать — запрещено лицензией Apple.
- Иконки — Tabler (`@tabler/icons-react`, MIT). Схемы данных — zod 4.
- `packages/nutrition-core`: чистый TypeScript без зависимостей от UI и ИИ.
- `packages/taste-core`: каталог блюд (`data/catalog.json`), байесовская модель вкуса и отбор карточек игры, симуляция `sim/`.
- `packages/contracts`: zod-схемы, общие для сайта и будущего API (`QuizAnswersV1`, `TasteProfileV1`, `toQuestionnaireInput`).
- Появляются по фазам этапа 4: `packages/food-data` (блюда: роли, аллергены, порции, нутриенты, фото, тексты, рецепты —
  только из скриптов и источников), `packages/menu-core` (чистый движок меню, работает в Web Worker и Node),
  `packages/kiki-core` (инструменты, протокол SSE, сводка контекста, валидатор чисел), `apps/api` (Node 24, Render Web
  Service `refectorio-api`, сервер Кики без хранения). Локальные данные — версионированный IndexedDB.
- Тесты: Vitest 5, Playwright 1.63 (Chromium, Firefox, WebKit), `@axe-core/playwright`, Lighthouse CI.
- Хостинг: Render Static Site (основной, base `/`) и GitHub Pages (зеркало, base — имя репозитория: `/Refectorio-project/`).

## Команды (из корня `refectorio-app/`)

| Команда | Что делает |
|---|---|
| `npm ci` | установка строго по `package-lock.json` |
| `npm run dev` | дев-сервер сайта (http://localhost:5173) |
| `npm run build` | сборка всех пакетов |
| `npm run lint` / `npm run typecheck` | ESLint (0 предупреждений) / проверка типов |
| `npm test` / `npm run test:coverage` | юнит-тесты Vitest / с покрытием |
| `npm run test:quiet` | юнит-тесты коротко: только падения — обычный режим работы |
| `npm run test:e2e` | e2e Playwright (сам собирает и поднимает `preview`) |
| `npm run e2e:quiet` | e2e в Chromium коротко; дополнительные аргументы — после `--` |
| `npm run secrets:check` | какие ключи на месте и доступны ли сервисы; ключи не выводит |
| `npm run format` | Prettier |
| `npm run assets` | пересобрать картинки из `assets-src/` в `apps/web/src/assets/generated/` |
| `npm run lhci` | Lighthouse CI с бюджетами |
| `npm run quiz-icons` | пересобрать иконки теста из PNG команды |
| `npm run sim -- --users 5000 --out <папка>` | симуляция игры «Выберите блюдо» (taste-core) |
| `npm run photos:curate` → `photos:sheets` → `photos:finalize` | подбор фото блюд (нужен ключ Unsplash в `UNSPLASH_ACCESS_KEY` или `.secrets/`), см. `docs/photo-licensing.md` |
| `npm run photos:runtime` | пересобрать облегчённую копию манифеста фото для сайта |

Перед коммитом husky запускает lint-staged (ESLint + Prettier на изменённых файлах).

## Структура

```
apps/web/src/
  app/          App.tsx, провайдеры (MotionConfig, LazyMotion), сцены по hash
  scenes/       HeroScene, AboutScene, SceneController (ввод, блокировки, хореография)
  features/     team-dialog (раскрытие карточки команды), quiz (тест: flow/ steps/ components/ tinder/ finale/)
  components/   Lines, Toast (карточки и кнопки пока живут в сценах)
  motion/       WaveHover, TiltGlare, токены пружин и длительностей, хуки
  engine/       food-field — движок летающей еды (чистый TS) + тонкая React-обёртка
  content/      site.ru.ts — тексты главной; quiz.ru.ts — тексты теста (обе с zod-схемами)
  styles/       tokens.css (дизайн-токены + @theme), globals.css
  assets/generated/  результат `npm run assets` (коммитится)
packages/nutrition-core/  расчёты норм и правила безопасности (guardrails) + тесты
packages/taste-core/      каталог блюд, модель вкуса, отбор карточек, манифест фото (data/), симуляция (sim/)
packages/contracts/       zod-схемы ответов теста и профиля вкуса
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
- Тексты интерфейса — только в `apps/web/src/content/`: `site.ru.ts` (главная), `quiz.ru.ts` (тест), новые `menu.ru.ts`,
  `recipes.ru.ts`, `kiki.ru.ts`, `account.ru.ts`, все с zod-схемами. В компонентах текста нет.
- Ключи API читает только `scripts/secrets/read-key.mjs` (переменная окружения, затем `.secrets/`); на сервере — только
  переменные окружения. Ключ не попадает в логи, вывод, тесты и отслеживаемые файлы.
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
- Всё доступно с клавиатуры; фокус с клавиатуры — собственным состоянием элемента (волна, заливка ✕, подчёркивание),
  без обводок и колец (этап 3, 4.7); зоны касания ≥ 44×44 px.
- Неактивная сцена и фон под диалогом — `inert`; декоративная еда — `aria-hidden`.
- axe — 0 серьёзных нарушений. Осознанное исключение: белый мелкий текст на `#E63946` (4,17:1), см. `docs/design-system.md`.

## Запреты

- Не коммитить секреты, `.env*` (кроме `.env.example`), `node_modules`, `dist`.
- Не делать `git push --force`, `git reset --hard` на общих ветках.
- Не менять дизайн «по вкусу»: палитра (`#FEF9F7`, акцент `#7D9C65`, бежевые блоки `#F2E4D8`), шрифт, композиция и
  постоянная фоновая анимация еды заданы макетами. Старый красный — только смысловой цвет: калории, ошибки, пропущенный день.
- Скиллы `landing-page-design` и `ui-ux-pro-max` — методология и чек-листы; их шрифты, иконки, палитры и таблицы отступов
  не применяем (макеты и дизайн-система важнее).
- Не добавлять вторую анимационную библиотеку (GSAP) без доказанной необходимости.
- ИИ-код не выдаёт непроверенных чисел: только результаты инструментов и сводка контекста, сверенные валидатором чисел.
- Не встраивать шрифты Apple (SF Pro), не использовать картинки без понятной лицензии.
- Не добавлять вход через Google или GitHub (199-ФЗ): только VK ID и Яндекс ID (этап 3).

## Подагенты (`.claude/agents/`)

`science-fact-checker`, `design-reviewer`, `a11y-auditor`, `perf-auditor`, `motion-reviewer` — независимая проверка
(sonnet, high). `scout` — справки по коду и логам (haiku, вместо Explore). `researcher` — исследования, `content-writer` —
пакеты контента (sonnet, medium). Модель в вызове Agent указывай явно.
