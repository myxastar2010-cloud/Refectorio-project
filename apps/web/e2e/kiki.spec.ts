import { expect, test, type Page, type Route } from '@playwright/test';
import { collectErrors, seriousViolations } from './helpers';

// ТЗ этапа 4, 07 §10–§12: Kiki's chat against a scripted server (SSE frames as `apps/api` sends them) — a browser tool
// round trip, a proposal applied from its preview, choice chips, readable errors with a retry, the history kept.

type Frame = { readonly type: string } & Record<string, unknown>;
type Reply = readonly Frame[] | { readonly status: number; readonly json?: unknown };
type Sent = {
  readonly messages: { role: string; content: string; name?: string }[];
  readonly digest: string;
};

const usage = { promptTokens: 1, completionTokens: 1, cachedTokens: 0 };
const final = (text: string): Frame => ({
  type: 'final',
  text,
  replaced: false,
  messages: [{ role: 'assistant', content: text }],
  model: 'mock',
  usage,
});
const toolCall = (name: string, args: unknown): Frame[] => [
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

/** Scripts `/api/kiki/chat`: each POST takes the next reply; the request bodies are kept for checks. */
async function mockKiki(page: Page, replies: Reply[]): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route('**/api/health', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/kiki/chat', async (route: Route) => {
    sent.push(route.request().postDataJSON() as Sent);
    const reply = replies.shift();
    if (!reply) return route.fulfill({ status: 500, json: { code: 'internal' } });
    if (!Array.isArray(reply)) {
      const { status, json } = reply as { status: number; json?: unknown };
      return route.fulfill({ status, json: json ?? {} });
    }
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
      body: (reply as Frame[])
        .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
        .join(''),
    });
  });
  return sent;
}

const title = (page: Page) => page.getByRole('heading', { name: 'Моё меню на неделю:' });
const panel = (page: Page) => page.locator('.kiki-panel');
/** The conversation itself (the polite live region repeats the latest answer). */
const log = (page: Page) => panel(page).getByLabel('Переписка с Кики');
const composer = (page: Page) => panel(page).getByRole('textbox', { name: 'Спроси что угодно…' });

async function ask(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press('Enter');
}

test.describe('Kiki on the laptop', () => {
  test.use({ viewport: { width: 1536, height: 730 } });

  test('a question goes through a tool in the browser and comes back as the answer; the chat survives a reload', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const sent = await mockKiki(page, [
      [{ type: 'status', phase: 'thinking' }, ...toolCall('find_in_menu', { query: 'блины' })],
      [
        { type: 'text-delta', text: 'Блины — ' },
        { type: 'text-delta', text: 'в четверг.' },
        final('Блины — в четверг.'),
      ],
    ]);
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    await expect(panel(page).getByText('Не пишите ФИО')).toBeVisible();

    await ask(page, 'Сколько калорий в блинах?');
    await expect(log(page).getByText('Блины — в четверг.')).toBeVisible();
    await expect(composer(page)).toHaveValue('');

    // The second POST carries the browser tool's result; the digest holds no body data (07 §4).
    expect(sent).toHaveLength(2);
    const second = sent[1]?.messages ?? [];
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(second[2]?.name).toBe('find_in_menu');
    expect(() => JSON.parse(second[2]?.content ?? '') as unknown).not.toThrow();
    expect(sent[0]?.digest.length).toBeGreaterThan(100);
    expect(sent[0]?.digest).not.toMatch(/heightCm|weightKg|ageYears|рост|возраст/i);

    await page.reload();
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    await expect(log(page).getByText('Блины — в четверг.')).toBeVisible();
    await expect(log(page).getByText('Сколько калорий в блинах?')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a proposal: the card opens the preview, «Применить» changes the menu and offers an undo', async ({
    page,
  }) => {
    const sent = await mockKiki(page, [
      toolCall('propose_menu_change', {
        rules: [
          { kind: 'excludeIngredient', target: { category: 'garlic' }, textRu: 'Без чеснока' },
        ],
        reasonRu: 'аллергия на чеснок',
      }),
      [final('Подготовила меню без чеснока — посмотрите предпросмотр.')],
    ]);
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    await ask(page, 'У меня аллергия на чеснок');

    const card = panel(page).getByRole('button', { name: /Изменения меню/ });
    await expect(card).toBeVisible();
    expect(sent[1]?.messages.at(-1)?.content).toContain('previewId');

    await card.click();
    const preview = page.getByRole('dialog', { name: 'Предпросмотр изменений' });
    await expect(preview).toBeVisible();
    // Esc closes the preview and gives the focus back to its card.
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await expect(card).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(preview).toBeVisible();
    await expect(preview.getByText('Без чеснока')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await preview.getByRole('button', { name: 'Применить' }).click();
    await expect(preview).toBeHidden();
    await expect(page.getByText('Кики: изменения применены')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeVisible();
    await expect(card).toContainText('Применено');
  });

  test('a choice becomes chips; a pick is sent as the answer', async ({ page }) => {
    const sent = await mockKiki(page, [
      [
        {
          type: 'ui',
          ui: {
            kind: 'choice',
            questionRu: 'Как поступить с лазаньей?',
            options: ['Изменить рецепт', 'Убрать из меню'],
          },
        },
        final('Как поступить с лазаньей?'),
      ],
      [final('Хорошо, уберу.')],
    ]);
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    await ask(page, 'В лазанье мускатный орех, у меня его нет');

    const chips = panel(page).getByRole('group', { name: 'Как поступить с лазаньей?' });
    await expect(chips.getByRole('button')).toHaveCount(2);
    await chips.getByRole('button', { name: 'Убрать из меню' }).click();
    await expect(log(page).getByText('Хорошо, уберу.')).toBeVisible();
    // Chips belong to the latest question only.
    await expect(chips).toHaveCount(0);
    expect(sent[1]?.messages.at(-1)).toMatchObject({ role: 'user', content: 'Убрать из меню' });
  });

  test('errors read as plain words: the wait after a rate limit, a retry after an outage', async ({
    page,
  }) => {
    await mockKiki(page, [
      { status: 429, json: { code: 'rate_limited', retryAfterMs: 120_000 } },
      { status: 503, json: { code: 'provider_unavailable' } },
      [final('Теперь получилось.')],
    ]);
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });

    await ask(page, 'Привет');
    await expect(log(page).getByText('Можно продолжить через 2 мин.')).toBeVisible();
    await ask(page, 'Привет ещё раз');
    await expect(log(page).getByText('Кики сейчас недоступна.', { exact: false })).toBeVisible();
    await panel(page).getByRole('button', { name: 'Повторить' }).last().click();
    await expect(log(page).getByText('Теперь получилось.')).toBeVisible();
  });
});

test.describe('Kiki on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('Esc in the preview closes only the preview; the sheet and its focus stay', async ({
    page,
  }) => {
    await mockKiki(page, [
      toolCall('propose_menu_change', {
        rules: [
          { kind: 'excludeIngredient', target: { category: 'garlic' }, textRu: 'Без чеснока' },
        ],
        reasonRu: 'аллергия на чеснок',
      }),
      [final('Подготовила меню без чеснока.')],
    ]);
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Открыть Кики' }).last().click();
    const sheet = page.getByRole('dialog', { name: 'Кики — ваш личный ИИ' });
    await expect(sheet).toBeVisible();
    await ask(page, 'У меня аллергия на чеснок');
    const card = sheet.getByRole('button', { name: /Изменения меню/ });
    await card.click();
    const preview = page.getByRole('dialog', { name: 'Предпросмотр изменений' });
    await expect(preview).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await expect(sheet).toBeVisible();
    await expect(card).toBeFocused();
    // The «+» is a full touch target.
    const plus = await sheet.getByRole('button', { name: 'Прикрепить фото' }).boundingBox();
    expect(Math.min(plus?.width ?? 0, plus?.height ?? 0)).toBeGreaterThanOrEqual(44);
  });
});

test.describe('Kiki: an older proposal after a newer one', () => {
  test.use({ viewport: { width: 1536, height: 730 } });

  test('applied later, it adds only its own rule — the newer one stays; an applied card never applies again', async ({
    page,
  }) => {
    const rule = (category: string, textRu: string) =>
      toolCall('propose_menu_change', {
        rules: [{ kind: 'excludeIngredient', target: { category }, textRu }],
        reasonRu: 'по просьбе',
      });
    const sent = await mockKiki(page, [
      rule('garlic', 'Без чеснока'),
      [final('Подготовила: без чеснока.')],
      rule('fish', 'Без рыбы'),
      [final('Подготовила: без рыбы.')],
      [final('Хорошо.')],
    ]);
    await page.goto('./?menu=demo#menu');
    await expect(title(page)).toBeVisible({ timeout: 30_000 });
    await ask(page, 'без чеснока');
    await expect(log(page).getByText('Подготовила: без чеснока.')).toBeVisible();
    await ask(page, 'без рыбы');
    await expect(log(page).getByText('Подготовила: без рыбы.')).toBeVisible();
    const cards = panel(page).getByRole('button', { name: /Изменения меню/ });
    const preview = page.getByRole('dialog', { name: 'Предпросмотр изменений' });
    // The newer one first…
    await cards.nth(1).click();
    await preview.getByRole('button', { name: 'Применить' }).click();
    await expect(cards.nth(1)).toContainText('Применено');
    // …then the older one: the menu changed since, it re-runs on the current menu.
    await cards.nth(0).click();
    await expect(preview.getByText('Меню изменилось после этого предложения')).toBeVisible();
    await preview.getByRole('button', { name: 'Применить' }).click();
    await expect(cards.nth(0)).toContainText('Применено');
    // An applied card opens read-only.
    await cards.nth(0).click();
    await expect(preview.getByRole('button', { name: 'Применить' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    // The next request's digest lists both rules.
    await ask(page, 'спасибо');
    await expect(log(page).getByText('Хорошо.')).toBeVisible();
    const digest = sent.at(-1)?.digest ?? '';
    expect(digest).toContain('Без чеснока');
    expect(digest).toContain('Без рыбы');
  });
});
