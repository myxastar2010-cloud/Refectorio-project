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
/** Unsplash demo: 50 requests an hour — keep a few for download tracking. */
const UNSPLASH_RESERVE = 5;

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
      let result = await search[provider](keys[provider], query, pacer);
      if (
        result.throttled ||
        (provider === 'unsplash' && (result.limit.remaining ?? 99) <= UNSPLASH_RESERVE)
      ) {
        const waitMs =
          provider === 'pexels' && result.limit.resetAt
            ? Math.max(60_000, result.limit.resetAt - Date.now())
            : untilNextHourMs();
        console.log(
          `${provider}: лимит запросов — пауза ${Math.ceil(waitMs / 60_000)} мин (прогресс сохранён)`,
        );
        await writeJson(CANDIDATES_FILE, state);
        await sleep(waitMs);
        if (result.throttled) result = await search[provider](keys[provider], query, pacer);
      }
      found.push(...result.photos);
    }
    searched.add(provider);
  }
  const ranked = rankCandidates(found, dishQueries);
  const withThumbs = [];
  for (const candidate of ranked)
    if (await saveThumb(dish.id, candidate)) withThumbs.push(candidate);
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
