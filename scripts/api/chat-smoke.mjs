// Sends one chat request to a running Kiki server and prints the SSE events compactly (synthetic data only).
//   node scripts/api/chat-smoke.mjs [--url http://localhost:8787] "Сколько будет 3+64?"
const urlIndex = process.argv.indexOf('--url');
const base = urlIndex > 0 ? process.argv[urlIndex + 1] : 'http://localhost:8787';
const text =
  process.argv.filter((a, i) => i > 1 && a !== '--url' && i !== urlIndex + 1).join(' ') ||
  'Сколько будет 3+64?';

const body = {
  v: 1,
  turnId: 'smoke1',
  messages: [{ role: 'user', content: text }],
  memory: { summary: '', facts: [] },
  digest: 'Сегодня: вторник, 2026-11-10. Цель: поддержание веса.',
  turnStartedAt: Date.now(),
};
const started = performance.now();
const res = await fetch(`${base}/kiki/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
  body: JSON.stringify(body),
});
console.log('status', res.status, res.headers.get('content-type'));
if (!res.ok || !res.body) {
  console.log(await res.text());
  process.exit(1);
}
const decoder = new TextDecoder();
let buffer = '';
let deltas = 0;
for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let end;
  while ((end = buffer.indexOf('\n\n')) >= 0) {
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    const data = frame.split('\n').find((l) => l.startsWith('data:'));
    if (!data) continue;
    const event = JSON.parse(data.slice(5));
    const ms = Math.round(performance.now() - started);
    if (event.type === 'text-delta') {
      if (deltas++ === 0) console.log(`${ms} ms first text`);
      continue;
    }
    const { type, ...rest } = event;
    console.log(`${ms} ms ${type} ${JSON.stringify(rest).slice(0, 300)}`);
  }
}
