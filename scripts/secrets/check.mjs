// Stage 4 inputs check: which keys are in place and whether this computer reaches the services.
// Prints statuses and public model ids only — never a key. Run: npm run secrets:check
import { execFileSync } from 'node:child_process';
import { checkUnsplash } from '../photos/check-keys.mjs';
import { fetchWithTimeout } from '../photos/lib.mjs';
import { readKey } from './read-key.mjs';

const USDA_ARCHIVE =
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip';

/** The families the Kiki bake-off compares (07), plus anything else from their vendors worth a look. */
const CANDIDATES = [
  /deepseek.*v4/i,
  /glm-?5/i,
  /mistral.*large/i,
  /mistral.*medium/i,
  /kimi|moonshot/i,
  /qwen.*3/i,
  /nemotron.*(ultra|super)/i,
  /embed|rerank/i,
];

async function checkNvidia() {
  const key = await readKey('nvidia');
  if (!key) return ['NVIDIA: нет ключа'];
  try {
    const response = await fetchWithTimeout(
      'https://integrate.api.nvidia.com/v1/models',
      { headers: { Authorization: `Bearer ${key}` } },
      20_000,
    );
    if (response.status === 401 || response.status === 403) return ['NVIDIA: ключ не принят'];
    if (response.status === 451) return ['NVIDIA: закрыто для этого региона — нужен VPN'];
    if (!response.ok) return [`NVIDIA: ошибка ${response.status}`];
    const { data } = await response.json();
    const ids = data.map((model) => model.id).sort();
    const found = ids.filter((id) => CANDIDATES.some((pattern) => pattern.test(id)));
    return [
      `NVIDIA: OK, моделей ${ids.length}, кандидатов ${found.length}:`,
      ...found.map((id) => `  ${id}`),
    ];
  } catch {
    return ['NVIDIA: не отвечает — нужен VPN'];
  }
}

async function checkTavily() {
  const key = await readKey('tavily');
  if (!key) return ['Tavily: нет ключа'];
  try {
    const response = await fetchWithTimeout(
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'овсяная каша калорийность',
          search_depth: 'basic',
          max_results: 1,
        }),
      },
      20_000,
    );
    if (response.status === 401 || response.status === 403) return ['Tavily: ключ не принят'];
    if (!response.ok) return [`Tavily: ошибка ${response.status}`];
    return ['Tavily: OK (потрачен 1 запрос из 1 000 в месяц)'];
  } catch {
    return ['Tavily: не отвечает — попробуйте с VPN'];
  }
}

async function checkUsda() {
  try {
    const response = await fetchWithTimeout(USDA_ARCHIVE, { method: 'HEAD' }, 20_000);
    if (!response.ok) return [`USDA: ответ ${response.status}`];
    const size = Number(response.headers.get('content-length') ?? 0);
    return [`USDA: архив доступен${size > 0 ? ` (${(size / 1024 / 1024).toFixed(1)} МБ)` : ''}`];
  } catch {
    return ['USDA: не отвечает — нужен VPN'];
  }
}

/** The app's process may predate the variable, so the user's registry entry counts too; its value is discarded. */
function check21st() {
  if (process.env.API_KEY_21ST?.trim()) return ['21st.dev: переменная API_KEY_21ST задана'];
  if (process.platform !== 'win32') return ['21st.dev: нет переменной API_KEY_21ST'];
  try {
    execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'API_KEY_21ST'], { stdio: 'ignore' });
    return ['21st.dev: переменная задана, подхватится после перезапуска приложения'];
  } catch {
    return ['21st.dev: нет переменной API_KEY_21ST'];
  }
}

const results = await Promise.all([
  checkNvidia(),
  checkTavily(),
  checkUnsplash().then((line) => [line]),
  checkUsda(),
  check21st(),
]);
for (const line of results.flat()) console.log(line);
