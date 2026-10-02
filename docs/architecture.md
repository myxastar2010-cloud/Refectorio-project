# Архитектура Refectorio

Решения — в `docs/adr/` (0001–0007). Черновики этапов 2–3: модель данных — `docs/drafts/data-model.md`,
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
