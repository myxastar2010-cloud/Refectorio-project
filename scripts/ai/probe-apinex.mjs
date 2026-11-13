// APInex smoke test (stage 5, phase 0.3): what the free mimo model and the paid web tools really return, before
// phase 3 builds the provider on them. One request every 5 s (the free pool is 15 RPM per account, shared with the
// live Kiki). The key is read by readKey and never printed; bodies are cut to 200 characters.
//   node scripts/ai/probe-apinex.mjs [--out <file.json>] [--model free/mimo-v2.6-pro]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { readKey } from '../secrets/read-key.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://api.apinex.bond/v1';
const GAP_MS = 5_000;
const TIMEOUT_MS = 90_000;
const BODY_CAP = 200;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const MODEL = argValue('--model', 'free/mimo-v2.6-pro');
const OUT = path.resolve(
  argValue(
    '--out',
    path.join(
      HERE,
      '..',
      '..',
      '..',
      'refectorio-workspace',
      'reports',
      'stage-5',
      'ai',
      'probe.json',
    ),
  ),
);

const cut = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text && text.length > BODY_CAP ? `${text.slice(0, BODY_CAP)}…` : text;
};

const RATE_HEADERS = [
  'retry-after',
  'x-ratelimit-limit-requests',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-reset-requests',
];
const pickHeaders = (res) =>
  Object.fromEntries(
    [...res.headers.entries()].filter(
      ([name]) => RATE_HEADERS.includes(name) || name.startsWith('x-ratelimit'),
    ),
  );

let lastRequestAt = 0;
async function call(key, method, route, body, { stream = false } = {}) {
  const wait = lastRequestAt + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}${route}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(stream ? { Accept: 'text/event-stream' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const out = {
      status: res.status,
      headers: pickHeaders(res),
      contentType: res.headers.get('content-type'),
    };
    if (stream && res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let firstTokenMs = null;
      const events = [];
      let text = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            events.push('[DONE]');
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta ?? {};
            if (events.length < 3) events.push(cut(parsed));
            const piece = delta.content ?? '';
            if (piece && firstTokenMs === null)
              firstTokenMs = Math.round(performance.now() - started);
            text += piece;
            if (delta.reasoning_content || delta.reasoning) out.hasReasoningDelta = true;
          } catch {
            events.push(`unparsed: ${cut(data)}`);
          }
        }
      }
      return {
        ...out,
        firstTokenMs,
        totalMs: Math.round(performance.now() - started),
        firstEvents: events.slice(0, 4),
        text: cut(text),
      };
    }
    const raw = await res.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      /* not JSON */
    }
    return { ...out, totalMs: Math.round(performance.now() - started), json, body: cut(raw) };
  } catch (error) {
    return { status: 0, error: cut(error?.cause?.code ?? error?.name ?? String(error)) };
  } finally {
    clearTimeout(timer);
  }
}

// A 24×24 solid red PNG built here (no files, nothing personal): enough to tell whether the model sees images.
function syntheticPng() {
  const size = 24;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x += 1) row.set([220, 30, 30], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

const SYSTEM = 'Ты — Кики, ИИ-диетолог. Отвечай по-русски, одним коротким предложением.';
const TOOL = {
  type: 'function',
  function: {
    name: 'find_in_menu',
    description: 'Find dishes in the user menu by a Russian query, e.g. «блины».',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
};

async function main() {
  const key = await readKey('apinex');
  const report = { at: new Date().toISOString(), model: MODEL, steps: {} };
  if (!key) {
    report.error = 'no key (APINEX_API_KEY or .secrets/apinex-api-key.txt)';
    await save(report);
    return;
  }
  const s = report.steps;

  const models = await call(key, 'GET', '/models');
  const ids = Array.isArray(models.json?.data) ? models.json.data.map((m) => m.id) : [];
  s.models = {
    status: models.status,
    count: ids.length,
    hasModel: ids.includes(MODEL),
    free: ids.filter((id) => id.startsWith('free/')).slice(0, 30),
    sampleEntry: cut(models.json?.data?.find((m) => m.id === MODEL) ?? null),
    error: models.error ?? (models.status !== 200 ? models.body : undefined),
  };

  const chat = await call(key, 'POST', '/chat/completions', {
    model: MODEL,
    max_tokens: 200,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: 'Привет! Что съесть на обед в офисе?' },
    ],
  });
  s.chat = {
    status: chat.status,
    totalMs: chat.totalMs,
    headers: chat.headers,
    text: cut(chat.json?.choices?.[0]?.message?.content ?? null),
    finish: chat.json?.choices?.[0]?.finish_reason,
    usage: chat.json?.usage,
    messageKeys: Object.keys(chat.json?.choices?.[0]?.message ?? {}),
    error: chat.error ?? (chat.status !== 200 ? chat.body : undefined),
  };

  const streamed = await call(
    key,
    'POST',
    '/chat/completions',
    {
      model: MODEL,
      stream: true,
      max_tokens: 200,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: 'Назови один полезный перекус.' },
      ],
    },
    { stream: true },
  );
  s.stream = streamed;

  const tool = await call(key, 'POST', '/chat/completions', {
    model: MODEL,
    max_tokens: 300,
    tools: [TOOL],
    tool_choice: 'auto',
    messages: [
      { role: 'system', content: `${SYSTEM} О блюдах меню узнавай только через инструменты.` },
      { role: 'user', content: 'Есть ли в моём меню блины?' },
    ],
  });
  const message = tool.json?.choices?.[0]?.message;
  s.toolCall = {
    status: tool.status,
    totalMs: tool.totalMs,
    finish: tool.json?.choices?.[0]?.finish_reason,
    toolCalls: cut(message?.tool_calls ?? null),
    contentWhenTool: cut(message?.content ?? null),
    error: tool.error ?? (tool.status !== 200 ? tool.body : undefined),
  };

  const vision = await call(key, 'POST', '/chat/completions', {
    model: MODEL,
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Какого цвета эта картинка? Ответь одним словом.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${syntheticPng()}` } },
        ],
      },
    ],
  });
  const visionText = vision.json?.choices?.[0]?.message?.content ?? null;
  s.vision = {
    status: vision.status,
    totalMs: vision.totalMs,
    text: cut(visionText),
    seesRed: typeof visionText === 'string' && /красн|red/i.test(visionText),
    error: vision.error ?? (vision.status !== 200 ? vision.body : undefined),
  };

  const sub = await call(key, 'GET', '/subscription');
  s.subscription = { status: sub.status, body: cut(sub.json ?? sub.body), error: sub.error };

  const search = await call(key, 'POST', '/tools/web/search', {
    query: 'бизнес-ланч Москва Пресненская набережная',
    count: 3,
  });
  s.webSearch = {
    status: search.status,
    totalMs: search.totalMs,
    webCount: search.json?.results?.web?.length ?? null,
    newsCount: search.json?.results?.news?.length ?? null,
    firstResultKeys: Object.keys(search.json?.results?.web?.[0] ?? {}),
    firstTitle: cut(search.json?.results?.web?.[0]?.title ?? null),
    note: search.status === 402 ? 'нужен баланс для поиска' : undefined,
    error: search.error ?? (search.status !== 200 ? search.body : undefined),
  };

  const contents = await call(key, 'POST', '/tools/web/contents', {
    urls: ['https://example.com/'],
    formats: ['markdown'],
  });
  s.webContents = {
    status: contents.status,
    totalMs: contents.totalMs,
    body: cut(contents.json ?? contents.body),
    note: contents.status === 402 ? 'нужен баланс для поиска' : undefined,
    error: contents.error,
  };

  await save(report);
}

async function save(report) {
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`);
  const summary = Object.entries(report.steps ?? {}).map(([name, v]) => `${name}: ${v.status}`);
  console.log(report.error ?? summary.join(' · '));
  console.log(`→ ${OUT}`);
}

main().catch((error) => {
  console.error('probe failed:', error?.message ?? error);
  process.exitCode = 1;
});
