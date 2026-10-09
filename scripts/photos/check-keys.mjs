// Checks the photo API keys and whether this computer reaches the Pexels CDN (ТЗ §9.8 step 1).
// Prints only statuses — never a key. Run: node scripts/photos/check-keys.mjs
import { fetchWithTimeout, rateLimit, readKey } from './lib.mjs';

const PEXELS_PROBE_IMAGE =
  'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1600';

async function checkPexels() {
  const key = await readKey('pexels');
  if (!key) return 'Pexels: нет ключа';
  try {
    const response = await fetchWithTimeout(
      'https://api.pexels.com/v1/search?query=soup&per_page=1',
      { headers: { Authorization: key } },
      12_000,
    );
    if (response.status === 401 || response.status === 403) return 'Pexels: ключ не принят';
    if (!response.ok) return `Pexels: ошибка ${response.status}`;
    const { remaining } = rateLimit(response);
    return `Pexels: OK${remaining === null ? '' : `, осталось ${remaining} запросов в этом месяце`}`;
  } catch {
    return 'Pexels: API не отвечает (Cloudflare может быть замедлен — включите VPN на время подбора)';
  }
}

async function checkUnsplash() {
  const key = await readKey('unsplash');
  if (!key) return 'Unsplash: нет ключа';
  try {
    const response = await fetchWithTimeout(
      'https://api.unsplash.com/search/photos?query=soup&per_page=1',
      { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } },
      12_000,
    );
    if (response.status === 401) return 'Unsplash: ключ не принят';
    if (!response.ok) return `Unsplash: ошибка ${response.status}`;
    const { remaining } = rateLimit(response);
    return `Unsplash: OK, осталось ${remaining ?? '?'} запросов в этом часе`;
  } catch {
    return 'Unsplash: API не отвечает (попробуйте с VPN)';
  }
}

async function checkPexelsCdn() {
  const started = performance.now();
  try {
    const response = await fetchWithTimeout(PEXELS_PROBE_IMAGE, {}, 15_000);
    const bytes = (await response.arrayBuffer()).byteLength;
    const seconds = (performance.now() - started) / 1000;
    if (!response.ok || bytes < 100_000) {
      return `CDN Pexels: ответ ${response.status}, ${Math.round(bytes / 1024)} КБ — нужен VPN для подбора`;
    }
    const speed = bytes / 1024 / seconds;
    return `CDN Pexels: ${Math.round(bytes / 1024)} КБ за ${seconds.toFixed(1)} с (${Math.round(speed)} КБ/с)${speed < 100 ? ' — медленно, лучше с VPN' : ''}`;
  } catch {
    return 'CDN Pexels: недоступен (Cloudflare) — включите VPN или работаем только с Unsplash';
  }
}

for (const line of await Promise.all([checkPexels(), checkUnsplash(), checkPexelsCdn()])) {
  console.log(line);
}
