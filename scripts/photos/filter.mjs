// Candidate filtering and scoring for curate.mjs (pure functions, unit-tested in filter.test.mjs).
// The final choice is always visual (review sheets): this only removes the obviously wrong photos and orders the rest.

/** The photo must survive a 3:4 crop at 960 px wide with room to spare. */
export const MIN_SHORT_SIDE = 1200;
export const KEEP_TOP = 6;

/**
 * Words in a photo's description that rule it out: people and faces, text and logos, alcohol, and raw ingredients
 * instead of the cooked dish (ТЗ §9.8).
 */
const REJECT = [
  /\b(person|people|woman|women|man|men|girl|boy|child|children|kid|face|portrait|hands?|holding|chef|family|friends|couple)\b/i,
  /\b(text|logo|sign|menu|lettering|watermark|label|brand|packaging|package)\b/i,
  /\b(wine|beer|cocktail|alcohol|whisk(e)?y|vodka|champagne|liquor|rum|gin)\b/i,
  /\b(raw ingredients?|uncooked|ingredients|grocery|market|supermarket|recipe card)\b/i,
];

/** Dishes where «raw» is the dish itself (sushi, tartare, salads) skip the raw-ingredient rule. */
const RAW_OK = /\b(sushi|sashimi|poke|tartare|salad|carpaccio|ceviche|roll)\b/i;

export function rejected(photo, queries) {
  const text = `${photo.alt ?? ''}`;
  const rawDish = queries.some((q) => RAW_OK.test(q));
  return REJECT.some((pattern, index) => {
    if (index === 3 && rawDish) return false;
    return pattern.test(text);
  });
}

export function bigEnough(photo) {
  return Math.min(photo.width ?? 0, photo.height ?? 0) >= MIN_SHORT_SIDE;
}

const words = (text) =>
  new Set(
    `${text}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );

/**
 * Higher is better: description words shared with the queries, a portrait-ish shape (the card is 3:4), resolution
 * and — for Unsplash — likes as a weak quality signal.
 */
export function scoreCandidate(photo, queries) {
  const alt = words(photo.alt);
  const queryWords = new Set(queries.flatMap((q) => [...words(q)]));
  let overlap = 0;
  for (const w of queryWords) if (alt.has(w)) overlap += 1;
  const relevance = queryWords.size > 0 ? overlap / queryWords.size : 0;
  const aspect = (photo.height ?? 1) / (photo.width ?? 1);
  // 4:3 portrait (1.33) is ideal; square and tall photos still crop well, landscape loses most of the frame.
  const shape = aspect >= 1.2 && aspect <= 1.6 ? 1 : aspect >= 1 ? 0.75 : 0.35;
  const resolution = Math.min(1, Math.min(photo.width ?? 0, photo.height ?? 0) / 3000);
  const likes = photo.likes ? Math.min(1, Math.log10(1 + photo.likes) / 3) : 0;
  return 3 * relevance + 1.5 * shape + 0.5 * resolution + 0.5 * likes;
}

/** Filters, de-duplicates and keeps the best few candidates. */
export function rankCandidates(photos, queries, keep = KEEP_TOP) {
  const seen = new Set();
  return photos
    .filter((photo) => {
      const key = `${photo.provider}:${photo.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return photo.src && photo.thumb && bigEnough(photo) && !rejected(photo, queries);
    })
    .map((photo) => ({ ...photo, score: Math.round(scoreCandidate(photo, queries) * 1000) / 1000 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, keep);
}
