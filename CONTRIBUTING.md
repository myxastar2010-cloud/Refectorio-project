# Как участвовать в Refectorio

Спасибо, что помогаете! Этот файл — короткие правила для команды Modern Manifesto и всех, кто хочет помочь.

## Подготовка

1. Установите [Node.js 24 LTS](https://nodejs.org/) (npm 11 входит в комплект) и [Git](https://git-scm.com/).
2. Склонируйте репозиторий и выполните в его папке `npm ci`.
3. `npm run dev` — сайт откроется на http://localhost:5173.

## Как вносить изменения

1. Создайте ветку от `main`: `git switch -c feat/короткое-название`.
2. Сделайте изменения маленькими шагами. Перед коммитом husky сам запустит ESLint и Prettier на изменённых файлах.
3. Проверьте локально: `npm run lint`, `npm run typecheck`, `npm test`, при изменениях сайта — `npm run test:e2e`.
4. Коммиты — в формате [Conventional Commits](https://www.conventionalcommits.org/ru/) на английском:
   `feat(web): add team dialog`, `fix(core): clamp weekly rate`, `docs: update science sources`.
5. Откройте pull request в `main`, опишите, что и зачем поменяли, приложите скриншот, если менялся интерфейс.
   CI проверит линтер, типы, тесты, сборку, e2e и Lighthouse.

## Правила

- **Тексты сайта** — только в `apps/web/src/content/site.ru.ts`.
- **Цвета, размеры, тайминги** — только из токенов (`apps/web/src/styles/tokens.css`, `apps/web/src/motion/tokens.ts`).
- **Картинки** — кладите исходник в `assets-src/`, затем `npm run assets`; результат коммитится.
- **Числа о питании** — только со ссылкой на научный источник (см. `docs/science/`). Пороги безопасности без источника не меняем.
- **Секреты** (ключи API, токены, пароли) — никогда не коммитим. Пример переменных — `.env.example`.
- **Дизайн** задан макетами: палитру, шрифт и композицию «по вкусу» не меняем.

## Claude Code

В репозитории есть настройки для Claude Code: `CLAUDE.md`, правила `.claude/rules/` и подагенты `.claude/agents/`
(`science-fact-checker`, `design-reviewer`, `a11y-auditor`, `perf-auditor`, `motion-reviewer`) — для независимых проверок.

## Вопросы

Пишите в Issues репозитория.
