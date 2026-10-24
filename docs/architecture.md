# Архитектура Refectorio

Решения — в `docs/adr/` (0001–0010). Черновики этапов 2–3: модель данных — `docs/drafts/data-model.md`,
контракт API — `docs/drafts/openapi.yaml`.

## 1. Контекст системы

```mermaid
flowchart LR
  user([Пользователь<br/>браузер, телефон])
  parent([Взрослый<br/>семейный режим])
  subgraph refectorio[Refectorio]
    web[Сайт<br/>статический фронтенд]
    api[API<br/>этапы 2–3]
  end
  ai[(ИИ-провайдеры<br/>DeepSeek / GLM / Kimi)]
  db[(Neon Postgres<br/>только аккаунты)]
  idp[VK ID / Яндекс ID]
  user --> web
  parent --> web
  web -- "HTTPS, JSON" --> api
  api -- "обезличенные параметры" --> ai
  api --> db
  user -. "вход по желанию" .-> idp
  idp -.-> api
```

## 2. Контейнеры

```mermaid
flowchart TB
  subgraph browser[Браузер]
    spa[apps/web<br/>React 19 + Motion<br/>сцены, тест, меню]
    store[(localStorage / IndexedDB<br/>гостевой режим)]
    core1[packages/nutrition-core<br/>расчёты и guardrails]
    spa --> store
    spa --> core1
  end
  subgraph render_static[Render Static Site + GitHub Pages]
    cdn[dist: HTML, JS, CSS,<br/>шрифты, AVIF/WebP]
  end
  subgraph render_api[Render Web Service, Frankfurt]
    gateway[API: Hono + zod<br/>лимиты, ALTCHA, кэш]
    core2[packages/nutrition-core<br/>тот же код]
    solver[Решатель порций<br/>HiGHS WASM + эвристика]
    validator[Валидатор ответа ИИ]
    gateway --> core2
    gateway --> solver
    gateway --> validator
  end
  cron[Будильник<br/>GitHub Actions / cron-job.org] -- "GET /health каждые 10–14 мин" --> gateway
  cdn --> spa
  spa -- "POST /v1/menu" --> gateway
  gateway --> llm[(ИИ-провайдер)]
  gateway --> neon[(Neon Postgres)]
```

Один и тот же пакет `nutrition-core` работает и в браузере (живой расчёт в тесте), и на сервере (меню) — числа одинаковы везде.

## 3. Поток генерации меню

```mermaid
sequenceDiagram
  autonumber
  participant U as Пользователь
  participant W as Сайт
  participant A as API
  participant C as nutrition-core
  participant L as ИИ-модель
  participant S as Решатель
  U->>W: проходит тест (2–3 мин)
  W->>C: guardrails(анкета)
  alt BLOCK / до 1 года
    C-->>W: отказ + направление к врачу
  else разрешено
    W->>A: POST /v1/menu (обезличенная анкета)
    A->>C: нормы: BMR, TDEE, цель, БЖУ, клетчатка, вода
    A->>A: фильтр базы блюд: аллергены, режим питания, время, бюджет
    A->>L: список допустимых ID + задача (JSON-схема, без чисел)
    L-->>A: выбранные ID + тексты
    A->>S: подбор порций 0,5–1,5× под цели (±5% ккал, белок ≥ цели)
    A->>A: валидатор: схема, ID, аллергены, допуски, повторы
    opt ошибка (до 2 повторов)
      A->>L: исправь по списку ошибок
    end
    opt ИИ недоступен или снова ошибка
      A->>S: алгоритм без ИИ (решатель + эвристика)
    end
    A-->>W: меню + «почему?» со ссылками на источники
    W-->>U: интерактивное меню
  end
```

## 4. Тест «Создать меню» (этап 2)

Тест открывается по «Создать меню» (адрес `#quiz`) поверх главной: главная становится `inert`, летающая еда
размывается и замедляется. Весь код теста — ленивые чанки, главная от него не тяжелеет.

```mermaid
flowchart TB
  app[App.tsx<br/>сцены hero / about / quiz] -- "наведение, фокус, простой" --> load[loadQuiz.ts]
  load --> scene[QuizScene<br/>чанк теста ≤ 90 КБ gz]
  load --> photos[(photo-runtime.json<br/>свой чанк ≤ 25 КБ gz)]
  photos -. "имена файлов" .-> files[(/dish-photos/<br/>фото с нашего сайта)]
  scene --> flow[flow/<br/>steps · machine · safety · persistence]
  scene --> stage[components/StepStage<br/>переходы шагов]
  stage --> steps[steps/<br/>варианты · Да/Нет · строки + колесо · чипы + «+» · текст]
  stage --> game[tinder/<br/>игра «Выберите блюдо»]
  stage -. "простой на последних шагах" .-> finale[finale/<br/>свой чанк: передача точки, подписи, волна]
  finale -.-> story[story/ + story-data.json<br/>Canvas 2D история, свой чанк ≤ 30 КБ gz]
  finale -.-> gl[revealGl<br/>WebGL2 волна-демо]
  game -.-> dish[(dish-numbers · dish-text<br/>описание блюд, свои чанки)]
  game --> taste[packages/taste-core<br/>каталог · модель · отбор]
  flow --> core[packages/nutrition-core<br/>guardrails · вес · активность]
  flow --> contracts[packages/contracts<br/>QuizAnswersV1 · TasteProfileV1]
  flow --> ls[(localStorage<br/>черновик и результат)]
```

- **Поток — данные.** `flow/steps.ts` перечисляет шаги (id, вид, `showIf(ответы)`, проверка), `flow/machine.ts` —
  чистый редьюсер (ответ, «Назад», отмена карточки, переход), `flow/safety.ts` сверяет ответы с guardrails
  (`nutrition-core`) и решает, какие уведомления показать и что поменять (например, цель «похудение» при диабете
  2 типа → «поддержка»). Всё это — чистые функции с юнит-тестами.
- **История браузера.** Каждый ответ в игре и каждый шаг — отдельная запись, поэтому системная кнопка «Назад»
  работает как «Вернуться» (D-039). Глубина считается из состояния (`historyDepth`), откат на n шагов — `rewind`.
- **Хранение.** Черновик — `localStorage['refectorio.quiz.v1']` (версия, проверка zod при чтении, срок 30 дней,
  испорченный — тихо забывается), результат — `refectorio.quiz.result.v1`. На сервер ничего не уходит (ADR 0003).
- **60 fps — вне React.** Перетаскивание карточки, физика колеса, морфы панелей и холст генерации живут в refs и motion values;
  в состоянии React — только ответы и экран.
- **Генерация (этап 3, ADR 0012).** История из линейных рисунков на Canvas 2D: рисунки разворачиваются в точки при
  сборке (`scripts/story`, `npm run story`), сцены двигают свои части матрицами, превращения — облака точек на дугах,
  временная шкала с юнит-тестами, подписи по меткам сцен. Притяжения еды больше нет.
- **Описание блюд (этап 3, D-056).** Касание или свайп вниз открывает на карточке описание и (когда будут посчитаны)
  калории и БЖУ стандартной порции: цифры — `taste-core/data/dish-numbers.json` (считает скрипт по рецептам и USDA,
  `scripts/dish-data`), тексты — `dish-text.json`, грузятся в простое после первой карточки.
- **Безопасность ввода.** Свободный текст (нелюбимые продукты, «Что нам следует знать?», свои пункты чипов) хранится
  отдельно от словарных значений и ограничен по длине (`INPUT_LIMITS`); на этапе 3 он считается непроверенными
  данными (R11).

## 5. taste-core: как игра узнаёт вкус за 10 ответов

```mermaid
flowchart LR
  catalog[(catalog.json<br/>186 блюд, признаки)] --> features[features.ts<br/>разреженные векторы]
  features --> model[model.ts<br/>пробит-модель, гауссов априор,<br/>ADF-обновление]
  model --> selection[selection.ts<br/>BALD × P(ответ) + правила]
  selection --> engine[engine.ts<br/>сессия: replay, peek, undo,<br/>скрытые блюда]
  engine --> profile[profile.ts<br/>TasteProfileV1: вероятности, подсказки]
  sim[sim/<br/>5000 синтетических игроков] -. "проверка" .-> selection
```

- Сессия детерминирована: seed + решения → те же карточки, поэтому черновик восстанавливается повтором ответов.
- Блюда без подобранного фото игра не показывает (`hidden`), но их вероятность «понравится» всё равно считается.
- Подробности и альтернативы — ADR 0008; итоги симуляции — `refectorio-workspace/reports/stage-2/taste-sim/` (D-035).

## 6. Фото блюд

```mermaid
flowchart LR
  curate[curate.mjs<br/>поиск Unsplash · фильтр · топ-6] --> sheets[review-sheets.mjs<br/>листы 6 × 6]
  sheets --> picks[(picks.json<br/>визуальный выбор)]
  overrides[(photo-overrides.json<br/>закрепления команды)] --> finalize
  picks --> finalize[finalize.mjs<br/>download_location · blurhash · кадр]
  finalize --> manifest[(photo-manifest.json<br/>метаданные, в git)]
  finalize --> runtime[(photo-runtime.json<br/>копия для сайта)]
  finalize --> credits[docs/photo-credits.md]
  manifest --> materialize[materialize.mjs<br/>при каждой сборке: скачать · 3:4 · AVIF/WebP · размытая копия]
  materialize --> cache[(.cache/dish-photos<br/>вне git)]
  materialize --> public[(public/dish-photos<br/>вне git, уходит на хостинг)]
  runtime --> card[Карточка блюда<br/>фото с нашего сайта]
  public --> card
```

- Ключи читают только скрипты (переменная окружения или `.secrets/` вне git); сайт к API не обращается.
- Фото раздаёт наш сайт (ADR 0011, D-048): `materialize.mjs` собирает их при каждой сборке, имена файлов
  (`<провайдер>-<id>-f<x>x<y>-v<версия>-<ширина>`) браузер строит сам по `photo-runtime.json`. Повторная сборка без
  изменений пропускается по хэшу манифеста; сборка для публикации падает, если не хватает больше 5 % фото.
- Цепочка на карточке: наше фото → заглушка из blurhash с названием блюда. Файлов фото в git нет — правила в
  `docs/photo-licensing.md`. Флаг `PHOTO_HOSTING=unsplash` возвращает хотлинк с подписью этапа 2.
