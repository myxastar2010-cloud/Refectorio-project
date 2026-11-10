/* global document, window */
// Screenshots of the menu page's states for reviewers (ТЗ этапа 4, фаза 4): each state is a short scripted action on
// `?menu=demo`; each window of the matrix gets a JPEG (≤ 1280 px wide) and a line in report.json (clipped boxes, console
// errors). Needs a served build: preview_start web-test (4173) or npm run preview.
//   node scripts/menu-shots.mjs [--url http://localhost:4173/] [--states base,dish-menu] [--windows laptop-1536,phone-390]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    out: {
      type: 'string',
      default: path.join(ROOT, '..', 'refectorio-workspace', 'reports', 'stage-4', 'menu-shots'),
    },
    states: { type: 'string', default: 'base' },
    windows: { type: 'string', default: 'laptop-1536' },
    query: { type: 'string', default: '?menu=demo' },
  },
});

/** name, width, height, touch device */
const WINDOWS = [
  ['laptop-1536', 1536, 730, false],
  ['desktop-1920', 1920, 1080, false],
  ['1440', 1440, 900, false],
  ['1366', 1366, 768, false],
  ['1280', 1280, 720, false],
  ['tablet-1024', 1024, 768, true],
  ['tablet-768', 768, 1024, true],
  ['tablet-820', 820, 1180, true],
  ['phone-390', 390, 844, true],
  ['phone-360', 360, 800, true],
  ['landscape-844', 844, 390, true],
];

const firstDish = (page) => page.locator('.dish-card').first();

// ---------- Kiki (ТЗ 07 §10): a scripted server, so the shots never depend on the live model ----------
const usage = { promptTokens: 1, completionTokens: 1, cachedTokens: 0 };
const sse = (frames) =>
  frames.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const final = (text) => ({
  type: 'final',
  text,
  replaced: false,
  messages: [{ role: 'assistant', content: text }],
  model: 'mock',
  usage,
});
const call = (name, args) => [
  {
    type: 'continue',
    messages: [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: `c-${name}`, name, args: JSON.stringify(args) }],
      },
    ],
  },
  { type: 'tool-call', callId: `c-${name}`, name, args },
];
/** Replies in order; `hang` leaves the request open (the thinking state). */
async function scriptKiki(page, replies) {
  await page.route('**/api/health', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/kiki/chat', (route) => {
    const reply = replies.shift();
    if (!reply || reply === 'hang') return undefined;
    return route.fulfill({ headers: { 'content-type': 'text/event-stream' }, body: sse(reply) });
  });
}
async function openKiki(page) {
  const panel = page.locator('.kiki-panel');
  const opener = page.getByRole('button', { name: 'Открыть Кики' });
  if ((await opener.count()) > 0 && !(await page.locator('.menu-app[data-kiki-open]').count()))
    if (await opener.last().isVisible()) await opener.last().click();
  await panel.getByRole('textbox').waitFor();
  return panel;
}
async function ask(page, text) {
  const box = page.locator('.kiki-panel').getByRole('textbox');
  await box.fill(text);
  await box.press('Enter');
}
const KIKI_CONVERSATION = [
  [...call('find_in_menu', { query: 'блины' })],
  [
    { type: 'ui', ui: { kind: 'open', target: 'search' } },
    final(
      'Блины в меню дважды:\n\n- **четверг**, завтрак — по данным меню;\n- **воскресенье**, завтрак — порция побольше.\n\nКБЖУ — в карточке блюда, вкладка «КБЖУ».',
    ),
  ],
  call('propose_menu_change', {
    rules: [{ kind: 'excludeIngredient', target: { category: 'garlic' }, textRu: 'Без чеснока' }],
    reasonRu: 'аллергия на чеснок',
  }),
  [final('Подготовила меню без чеснока — посмотрите предпросмотр и примените, если всё подходит.')],
  [
    {
      type: 'ui',
      ui: {
        kind: 'choice',
        questionRu: 'В какие дни яйца на завтрак?',
        options: ['Каждый день', 'Только пн и ср', 'По выходным'],
      },
    },
    final('В какие дни добавить яйца на завтрак?'),
  ],
];
async function kikiConversation(page) {
  await scriptKiki(
    page,
    KIKI_CONVERSATION.map((r) => r),
  );
  const panel = await openKiki(page);
  await ask(page, 'Сколько калорий в блинах?');
  await panel.getByText('КБЖУ — в карточке блюда').first().waitFor();
  await ask(page, 'У меня аллергия на чеснок');
  await panel.getByRole('button', { name: /Изменения меню/ }).waitFor();
  await ask(page, 'Хочу яйца на завтрак');
  await panel.getByRole('button', { name: 'Только пн и ср' }).waitFor();
  return panel;
}

/** Each state: what to do after the page is up. */
const STATES = {
  base: async () => {},
  'kiki-empty': async (page) => {
    await scriptKiki(page, []);
    await openKiki(page);
  },
  'kiki-thinking': async (page) => {
    await scriptKiki(page, ['hang']);
    const panel = await openKiki(page);
    await ask(page, 'Что у меня сегодня на ужин?');
    await panel.locator('.kiki-dots').waitFor();
    await page.waitForTimeout(2200);
  },
  'kiki-chat': async (page) => {
    await kikiConversation(page);
  },
  'kiki-preview': async (page) => {
    const panel = await kikiConversation(page);
    await panel.getByRole('button', { name: /Изменения меню/ }).click();
    await page.getByRole('dialog', { name: 'Предпросмотр изменений' }).waitFor();
    await page.waitForTimeout(400);
  },
  privacy: async (page) => {
    await page.getByRole('button', { name: 'Аккаунт' }).first().click();
    await page.getByRole('menuitem', { name: 'Как мы используем данные' }).click();
    await page.getByRole('dialog', { name: 'Как мы используем ваши данные' }).waitFor();
    await page.waitForTimeout(500);
  },
  'dish-menu': async (page, touch) => {
    await firstDish(page).locator('.dish-more').click();
    const item = page.getByRole('menuitem', { name: 'Заменить блюдо' });
    if (touch) await item.click();
    else await item.hover();
    await page.getByRole('menuitem', { name: 'Заменить с ИИ' }).waitFor();
  },
  replace: async (page) => {
    await firstDish(page).locator('.dish-more').click();
    await page.getByRole('menuitem', { name: 'Заменить блюдо' }).click();
    await page.getByRole('menuitem', { name: 'Заменить с ИИ' }).click();
    await page.locator('.replace-option:not(.replace-option--ghost)').first().waitFor();
  },
  details: async (page) => {
    await firstDish(page).locator('.dish-open').click();
    await page.getByRole('dialog').waitFor();
  },
  search: async (page) => {
    const name = (await firstDish(page).locator('.dish-open').textContent()) ?? '';
    await page.getByRole('button', { name: 'Поиск по меню' }).click();
    await page.getByRole('combobox').fill(name.split(' ')[0] ?? '');
    await page.getByRole('option').first().waitFor();
    await page.getByRole('combobox').press('ArrowDown');
  },
  more: async (page, touch) => {
    await page.locator('.menu-top').getByRole('button', { name: 'Ещё' }).click();
    const item = page.getByRole('menuitem', { name: 'Скачать меню' });
    if (touch) await item.click();
    else await item.hover();
    await page.getByRole('menuitem', { name: 'PDF' }).waitFor();
  },
  widgets: async (page) => {
    for (const [name, color] of [
      ['Железо', 'Синий'],
      ['Белки', 'Золотой'],
      ['Витамин C', 'Коралловый'],
    ]) {
      await page.getByRole('button', { name: 'Изменить приёмы пищи' }).click();
      await page.locator('.meal-add').click();
      await page.getByRole('menuitem', { name: 'Добавить виджет' }).click();
      const picker = page.getByRole('dialog', { name: 'Новый виджет' });
      await picker.getByRole('button', { name, exact: true }).first().click();
      await picker.getByRole('radio', { name: color }).check({ force: true });
      await picker.getByRole('button', { name: 'Добавить' }).click();
      await page.getByRole('button', { name: 'Готово' }).click();
    }
    await page
      .getByRole('button', { name: /^Отметить «.+» съеденным$/ })
      .first()
      .click();
  },
  'widget-picker': async (page) => {
    await page.getByRole('button', { name: 'Изменить приёмы пищи' }).click();
    await page.locator('.meal-add').click();
    await page.getByRole('menuitem', { name: 'Добавить виджет' }).click();
    await page.getByRole('dialog', { name: 'Новый виджет' }).waitFor();
  },
  account: async (page, touch) => {
    await page.getByRole('button', { name: 'Аккаунт' }).first().click();
    const item = page.getByRole('menuitem', { name: 'Сменить аватар' });
    if (touch) await item.click();
    else await item.hover();
    await page.getByRole('menuitemradio').first().waitFor();
  },
  news: async (page) => {
    await page.getByRole('button', { name: /^Новости от Кики/ }).click();
    await page.getByRole('dialog', { name: 'Новости от Кики' }).waitFor();
  },
  letter: async (page) => {
    await STATES.news(page);
    await page.locator('.news-item').nth(1).click();
    await page.locator('.news-letter').waitFor();
  },
  goal: async (page) => {
    await page.getByRole('button', { name: /^Цель:/ }).click();
    await page.getByRole('dialog', { name: 'Цель' }).waitFor();
    await page.waitForTimeout(500);
  },
  /** Saves the PDF and the pictures next to the screenshots (for a reviewer). */
  downloads: async (page) => {
    for (const label of ['PDF', 'Картинка (PNG)']) {
      await page.locator('.menu-top').getByRole('button', { name: 'Ещё' }).click();
      await page.getByRole('menuitem', { name: 'Скачать меню' }).click();
      const waiting = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: label }).click();
      const file = await waiting;
      const name = `${String(page.viewportSize()?.width)}-${file.suggestedFilename().split('.').pop() ?? 'bin'}`;
      await file.saveAs(path.join(args.out, `download-${name}.${name.split('-').pop() ?? ''}`));
    }
  },
  'details-kbju': async (page) => {
    await STATES.details(page);
    await page.getByRole('tab', { name: 'КБЖУ' }).click();
  },
  'details-micros': async (page) => {
    await STATES.details(page);
    await page.getByRole('tab', { name: 'Витамины и минералы' }).click();
  },
  'details-allergens': async (page) => {
    await STATES.details(page);
    await page.getByRole('tab', { name: 'Аллергены' }).click();
  },
};

/** Runs in the page: elements cut by the window or by an ancestor that clips. */
function clipped() {
  const out = [];
  const { innerWidth: w, innerHeight: h } = window;
  for (const el of document.querySelectorAll(
    '.popover, .menu-item, .dish-card, .menu-pill, .widget, .dish-details, [role="dialog"]',
  )) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    // Cards in a row that scrolls sideways are meant to run past the edge.
    const row = el.closest('.dish-row');
    if (row && row.scrollWidth > row.clientWidth) continue;
    if (box.left < -0.5 || box.top < -0.5 || box.right > w + 0.5 || box.bottom > h + 0.5)
      out.push({
        el: el.className.toString().slice(0, 40),
        box: [box.left, box.top, box.right, box.bottom].map(Math.round),
      });
  }
  return out.slice(0, 12);
}

await mkdir(args.out, { recursive: true });
const browser = await chromium.launch();
const report = [];
const wanted = new Set(args.windows.split(','));
for (const [name, width, height, touch] of WINDOWS.filter(([n]) => wanted.has(n))) {
  for (const state of args.states.split(',')) {
    const run = STATES[state];
    if (!run) throw new Error(`unknown state ${state}`);
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      hasTouch: touch,
      isMobile: touch && width < 768,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text().slice(0, 160));
    });
    await page.goto(new URL(`${args.query}#menu`, args.url).href);
    await page.getByRole('heading', { name: 'Моё меню на неделю:' }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(400);
    let failed = null;
    try {
      await run(page, touch);
    } catch (error) {
      failed = String(error).slice(0, 200);
    }
    await page.waitForTimeout(350);
    const shot = await page.screenshot();
    const file = `${state}--${name}.jpg`;
    await sharp(shot)
      .resize({ width: Math.min(1280, width), withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(path.join(args.out, file));
    report.push({
      state,
      window: name,
      file,
      failed,
      errors,
      clipped: await page.evaluate(clipped),
    });
    await context.close();
  }
}
await browser.close();
await writeFile(path.join(args.out, 'report.json'), JSON.stringify(report, null, 1));
console.log(
  report
    .map(
      (r) =>
        `${r.state} ${r.window}: ${r.failed ? 'FAILED ' + r.failed : 'ok'} · errors ${String(r.errors.length)} · clipped ${String(r.clipped.length)}`,
    )
    .join('\n'),
);
