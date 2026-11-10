// Quick latency ping of the chat candidates on NVIDIA Build (phase 5 §3, before the bake-off): one streamed request
// per model/variant with one tool, measuring the first byte, the first visible token and the end. Synthetic text only.
//   node scripts/ai/ping.mjs [--out <file.json>]
import { writeFile } from 'node:fs/promises';
import { readKey } from '../secrets/read-key.mjs';

const BASE = 'https://integrate.api.nvidia.com/v1/chat/completions';
const TIMEOUT_MS = 150_000;

const VARIANTS = [
  { id: 'mistralai/mistral-large-4-1t-a52b', label: 'mistral' },
  {
    id: 'mistralai/mistral-large-4-1t-a52b',
    label: 'mistral-low',
    extra: { reasoning_effort: 'low' },
  },
  { id: 'z-ai/glm-5.3-flash', label: 'glm' },
  { id: 'z-ai/glm-5.3-flash', label: 'glm-low', extra: { reasoning_effort: 'low' } },
  { id: 'deepseek-ai/deepseek-v4.1-flash', label: 'deepseek' },
  {
    id: 'deepseek-ai/deepseek-v4.1-flash',
    label: 'deepseek-nothink',
    extra: { chat_template_kwargs: { thinking: false } },
  },
  { id: 'moonshotai/kimi-k2.6', label: 'kimi' },
  { id: 'nvidia/nemotron-3-super-120b-a12b', label: 'nemotron-super' },
  { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', label: 'nemotron-vl' },
];

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'find_in_menu',
      description: 'Find dishes in the user menu by a Russian query, e.g. «блины».',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
];

const MESSAGES = [
  {
    role: 'system',
    content:
      'Ты — Кики, ИИ-диетолог сервиса ПроЛанч. Отвечай по-русски, коротко. О блюдах меню пользователя узнавай только через инструменты.',
  },
  { role: 'user', content: 'Сколько калорий в блинах в моём меню?' },
];

async function ping(key, variant) {
  const started = performance.now();
  const out = { label: variant.label, model: variant.id };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: variant.id,
        messages: MESSAGES,
        tools: TOOLS,
        tool_choice: 'auto',
        stream: true,
        max_tokens: 1024,
        temperature: 0.3,
        ...variant.extra,
      }),
    });
    out.status = res.status;
    out.headersMs = Math.round(performance.now() - started);
    if (!res.ok || !res.body) {
      out.error = (await res.text()).slice(0, 200);
      return out;
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let reasoningChars = 0;
    const calls = [];
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        out.firstByteMs ??= Math.round(performance.now() - started);
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = json.choices?.[0]?.delta ?? {};
        if (delta.reasoning_content || delta.reasoning)
          reasoningChars += (delta.reasoning_content ?? delta.reasoning).length;
        if (delta.content) {
          out.firstTextMs ??= Math.round(performance.now() - started);
          content += delta.content;
        }
        for (const call of delta.tool_calls ?? []) {
          out.firstToolMs ??= Math.round(performance.now() - started);
          const slot = (calls[call.index ?? 0] ??= { name: '', args: '' });
          if (call.function?.name) slot.name += call.function.name;
          if (call.function?.arguments) slot.args += call.function.arguments;
        }
        if (json.choices?.[0]?.finish_reason) out.finish = json.choices[0].finish_reason;
        if (json.usage) out.usage = json.usage;
      }
    }
    out.totalMs = Math.round(performance.now() - started);
    out.content = content.slice(0, 160);
    out.reasoningChars = reasoningChars;
    out.calls = calls;
  } catch (error) {
    out.error = error.name === 'AbortError' ? 'timeout' : String(error.message).slice(0, 120);
    out.totalMs = Math.round(performance.now() - started);
  } finally {
    clearTimeout(timer);
  }
  return out;
}

const key = await readKey('nvidia');
if (!key) {
  console.error('Нет ключа NVIDIA');
  process.exit(1);
}
const outIndex = process.argv.indexOf('--out');
const results = await Promise.all(VARIANTS.map((v) => ping(key, v)));
for (const r of results)
  console.log(
    `${r.label.padEnd(18)} ${String(r.status ?? '-').padEnd(4)} first=${r.firstByteMs ?? '-'} text=${r.firstTextMs ?? '-'} tool=${r.firstToolMs ?? '-'} total=${r.totalMs ?? '-'} ${r.error ?? ''} calls=${JSON.stringify(r.calls ?? [])}`,
  );
if (outIndex > 0)
  await writeFile(
    process.argv[outIndex + 1],
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
