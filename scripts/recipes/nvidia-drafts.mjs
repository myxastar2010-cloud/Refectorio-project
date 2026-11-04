// Arm A of the recipe pilot: draft the 10 recipes with NVIDIA-hosted models, one repair turn on validation errors.
// Usage: node scripts/recipes/nvidia-drafts.mjs [model-slug ...]   (needs HTTPS_PROXY=http://127.0.0.1:7890)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateRecipe } from './validate.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PILOT = path.resolve(APP, '..', 'refectorio-workspace', 'reports', 'stage-4', 'recipe-pilot');
const CACHE = path.join(APP, '.cache', 'recipe-drafts');
const URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODELS = [
  'deepseek-ai/deepseek-v4.1-flash',
  'z-ai/glm-5.3-flash',
  'mistralai/mistral-large-4-1t-a52b',
];
const GAP_MS = 1800;
const TIMEOUT_MS = 420_000; // whole call
const IDLE_MS = 120_000; // no data at all

const { readKey } = await import(
  pathToFileURL(path.join(APP, 'scripts', 'secrets', 'read-key.mjs')).href
);
const key = await readKey('nvidia');
if (!key) throw new Error('NVIDIA key not found');

const brief = readFileSync(path.join(PILOT, 'BRIEF.md'), 'utf8');
const items = JSON.parse(readFileSync(path.join(PILOT, 'inputs.json'), 'utf8')).items;
const system = `${brief}\n\nОтветь только JSON-объектом Recipe`;
mkdirSync(CACHE, { recursive: true });

const slug = (m) => m.replace(/[^a-z0-9.]+/gi, '-').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

// One HTTP call with disk cache. Returns { content, usage, finish, ms } or throws { kind }.
async function chat(model, messages, state) {
  const file = path.join(
    CACHE,
    createHash('sha1')
      .update(model + JSON.stringify(messages))
      .digest('hex') + '.json',
  );
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const t0 = Date.now();
    // Streaming: a long non-streamed generation is cut by the gateway/proxy; chunks keep the connection alive.
    const body = {
      model,
      messages,
      temperature: 0.3,
      max_tokens: 6000,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (state.json) body.response_format = { type: 'json_object' };
    const ctl = new AbortController();
    let watchdog;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ctl.abort(), IDLE_MS);
    };
    const total = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    arm();
    console.log(
      `  call ${slug(model)} attempt ${attempt + 1} (${JSON.stringify(messages).length} chars)`,
    );
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (res.status === 400 && state.json) {
        state.json = false;
        clearTimeout(total);
        clearTimeout(watchdog);
        attempt--;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = { kind: 'http', status: res.status };
        clearTimeout(total);
        clearTimeout(watchdog);
        await sleep(5000);
        continue;
      }
      if (!res.ok)
        throw { kind: 'http', status: res.status, text: (await res.text()).slice(0, 200) };
      const decoder = new TextDecoder();
      let buf = '';
      let content = '';
      let usage = null;
      let finish = null;
      for await (const chunk of res.body) {
        arm();
        buf += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
          try {
            const j = JSON.parse(line.slice(5));
            const ch = j.choices?.[0];
            content += ch?.delta?.content ?? '';
            finish = ch?.finish_reason ?? finish;
            usage = j.usage ?? usage;
          } catch {
            /* partial or keep-alive line */
          }
        }
      }
      clearTimeout(total);
      clearTimeout(watchdog);
      const out = { content, usage, finish, ms: Date.now() - t0 };
      writeFileSync(file, JSON.stringify(out));
      return out;
    } catch (e) {
      clearTimeout(watchdog);
      clearTimeout(total);
      if (e.kind) throw e;
      lastErr = {
        kind: e.name === 'TimeoutError' || e.name === 'AbortError' ? 'timeout' : 'network',
        message: String(e.message ?? e).slice(0, 120),
      };
    }
  }
  throw lastErr;
}

function parseJson(text) {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

function check(content, item) {
  const recipe = parseJson(content);
  if (!recipe) return { recipe: null, errors: ['reply is not valid JSON (cut off or malformed)'] };
  return { recipe, errors: validateRecipe(recipe, item).errors };
}

const only = process.argv.slice(2);
for (const model of MODELS) {
  if (only.length && !only.includes(slug(model))) continue;
  const dir = path.join(PILOT, 'A', slug(model));
  mkdirSync(dir, { recursive: true });
  const runFile = path.join(dir, 'run.json');
  const run = { model, unavailable: false, items: {} };
  const state = { json: true };
  let streak = 0;
  for (const item of items) {
    const user = JSON.stringify(item);
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const rec = {
      ms: 0,
      tokensIn: 0,
      tokensOut: 0,
      finish: null,
      firstValid: false,
      finalValid: false,
      firstErrors: 0,
      finalErrors: 0,
    };
    try {
      const r1 = await chat(model, messages, state);
      streak = 0;
      rec.ms += r1.ms;
      rec.tokensIn += r1.usage?.prompt_tokens ?? 0;
      rec.tokensOut += r1.usage?.completion_tokens ?? 0;
      rec.finish = r1.finish;
      let c = check(r1.content, item);
      rec.firstErrors = c.errors.length;
      rec.firstValid = c.errors.length === 0;
      rec.firstErrorSample = c.errors.slice(0, 8);
      let finalRecipe = c.recipe;
      if (c.errors.length) {
        const repairMsgs = [
          ...messages,
          { role: 'assistant', content: r1.content },
          {
            role: 'user',
            content: `Валидатор нашёл ошибки:\n- ${c.errors.slice(0, 25).join('\n- ')}\nИсправь и верни весь JSON-объект Recipe целиком, только JSON.`,
          },
        ];
        try {
          const r2 = await chat(model, repairMsgs, state);
          rec.ms += r2.ms;
          rec.tokensIn += r2.usage?.prompt_tokens ?? 0;
          rec.tokensOut += r2.usage?.completion_tokens ?? 0;
          rec.finish = r2.finish;
          const c2 = check(r2.content, item);
          c = c2;
          if (c2.recipe) finalRecipe = c2.recipe;
        } catch (e) {
          rec.repairError = e.kind ?? String(e);
        }
      }
      rec.finalErrors = c.errors.length;
      rec.finalValid = c.errors.length === 0;
      rec.finalErrorSample = c.errors.slice(0, 8);
      if (finalRecipe)
        writeFileSync(path.join(dir, `${item.itemId}.json`), JSON.stringify(finalRecipe, null, 1));
    } catch (e) {
      rec.error = e.kind ? `${e.kind}${e.status ? ' ' + e.status : ''}` : String(e).slice(0, 100);
      streak = e.kind === 'timeout' ? streak + 1 : 0;
    }
    run.items[item.itemId] = rec;
    console.log(
      `${slug(model)} ${item.itemId}: ${rec.error ?? `${rec.ms} ms, first ${rec.firstErrors} err, final ${rec.finalErrors} err`}`,
    );
    writeFileSync(runFile, JSON.stringify(run, null, 1));
    if (streak >= 3) {
      run.unavailable = true;
      console.log(`${slug(model)}: 3 timeouts in a row — marked unavailable`);
      writeFileSync(runFile, JSON.stringify(run, null, 1));
      break;
    }
  }
}
