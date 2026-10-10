// Finds photo candidates for every dish (ТЗ §9.8 step 2). Needs a key; resumable — run it again to continue.
//   node scripts/photos/curate.mjs [--provider pexels|unsplash] [--dish d_borscht] [--refresh]
// Providers in order Pexels → Unsplash; the top 6 candidates per dish and their thumbnails (CDN, no API cost) go to
// .cache/photos/. Then: review-sheets.mjs → visual choice → finalize.mjs.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rankCandidates } from './filter.mjs';
import {
  CACHE_DIR,
  CANDIDATES_FILE,
  createPacer,
  fetchWithTimeout,
  loadCatalog,
  readJson,
  readKey,
  searchPexels,
  searchUnsplash,
  sleep,
  untilNextHourMs,
  writeJson,
} from './lib.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const onlyProvider = option('provider');
const onlyDish = option('dish');
const refresh = args.includes('--refresh');

const keys = { pexels: await readKey('pexels'), unsplash: await readKey('unsplash') };
const providers = ['pexels', 'unsplash'].filter(
  (p) => keys[p] && (!onlyProvider || onlyProvider === p),
);
if (providers.length === 0) {
  console.log('Нет ключей: фото не подбираются, сайт покажет заглушки. См. «КЛЮЧИ ДЛЯ ФОТО.md».');
  process.exit(0);
}

const { catalog, queries } = await loadCatalog();
const state = await readJson(CANDIDATES_FILE, { version: 1, dishes: {} });
const pacer = createPacer();
const search = { pexels: searchPexels, unsplash: searchUnsplash };
/**
 * Unsplash demo: 50 requests an hour. A couple are kept in reserve; when the hour's quota runs out the script sleeps
 * until the next hour (progress is saved after every dish, so it can also be stopped and restarted).
 */
const UNSPLASH_RESERVE = 2;
/** Enough good candidates for one dish: further queries are skipped (requests are the scarce resource). */
const ENOUGH = 4;
const remaining = { pexels: Infinity, unsplash: Infinity };

async function searchPolitely(provider, query) {
  for (;;) {
    if (remaining[provider] <= (provider === 'unsplash' ? UNSPLASH_RESERVE : 0)) {
      const waitMs = untilNextHourMs();
      console.log(
        `${provider}: лимит запросов — пауза ${Math.ceil(waitMs / 60_000)} мин (прогресс сохранён)`,
      );
      await writeJson(CANDIDATES_FILE, state);
      await sleep(waitMs);
      remaining[provider] = Infinity;
    }
    const result = await search[provider](keys[provider], query, pacer);
    if (result.limit.remaining !== null) remaining[provider] = result.limit.remaining;
    if (!result.throttled) return result;
    // Throttled although the counter looked fine (a rolling window): wait ten minutes and try again.
    remaining[provider] = 0;
    console.log(`${provider}: сервис просит подождать — пауза 10 мин`);
    await sleep(10 * 60_000);
    remaining[provider] = Infinity;
  }
}

async function saveThumb(dishId, candidate) {
  const dir = path.join(CACHE_DIR, 'thumbs', dishId);
  const file = path.join(dir, `${candidate.provider}-${candidate.id}.jpg`);
  if (existsSync(file)) return true;
  try {
    const response = await fetchWithTimeout(candidate.thumb, {}, 20_000);
    if (!response.ok) return false;
    await mkdir(dir, { recursive: true });
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

let done = 0;
for (const dish of catalog.dishes) {
  if (onlyDish && dish.id !== onlyDish) continue;
  const existing = state.dishes[dish.id];
  const wanted = providers.filter((p) => refresh || !existing?.searched?.includes(p));
  if (wanted.length === 0) continue;
  const dishQueries = queries[dish.id] ?? [dish.nameRu];
  const found = [...(existing?.candidates ?? [])];
  const searched = new Set(existing?.searched ?? []);
  for (const provider of wanted) {
    // Unsplash only tops up dishes where Pexels did not give enough choice.
    if (provider === 'unsplash' && found.filter((c) => c.provider === 'pexels').length >= 4) {
      searched.add(provider);
      continue;
    }
    for (const query of dishQueries) {
      const result = await searchPolitely(provider, query);
      found.push(...result.photos);
      if (rankCandidates(found, dishQueries).length >= ENOUGH) break;
    }
    searched.add(provider);
  }
  const ranked = rankCandidates(found, dishQueries);
  const withThumbs = [];
  for (const candidate of ranked)
    if (await saveThumb(dish.id, candidate)) withThumbs.push(candidate);
  if (ranked.length > 0 && withThumbs.length === 0) {
    console.log(`${dish.id}: миниатюры не скачались (CDN недоступен? нужен VPN)`);
  }
  state.dishes[dish.id] = {
    candidates: withThumbs,
    searched: [...searched],
    updatedAt: new Date().toISOString(),
  };
  await writeJson(CANDIDATES_FILE, state);
  done += 1;
  console.log(`${dish.id}: ${withThumbs.length} кандидатов (${[...searched].join(', ')})`);
}
console.log(`Готово: обработано блюд ${done}. Дальше — node scripts/photos/review-sheets.mjs`);
