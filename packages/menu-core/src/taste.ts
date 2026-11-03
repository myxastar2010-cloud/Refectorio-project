/**
 * P(like) of every menu item. Game dishes: the taste profile's own prediction (full posterior). Other items: the same
 * features through the posterior summary the profile keeps (means and variances; covariances are not stored, so the
 * prediction is a little less shrunk). Rounded to 1e-4 so that the planner's choices are bit-identical everywhere.
 */
import { dishFeatures, predictiveProbability } from '@refectorio/taste-core';
import type { MenuFood } from './foods';
import type { MenuProfile } from './profile';

const NEUTRAL = 0.5;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

export function likeProbability(food: MenuFood, taste: MenuProfile['taste']): number {
  const known = taste.predictions.get(food.id);
  if (known !== undefined) return known;
  if (taste.features.size === 0) return NEUTRAL;
  let mean = 0;
  let variance = 0;
  for (const [id, x] of dishFeatures(food.features)) {
    const w = taste.features.get(id);
    if (!w) continue;
    mean += w.mean * x;
    variance += w.variance * x * x;
  }
  return round4(predictiveProbability(mean, variance));
}
