import { dietFlags, type Dish } from '../src/catalog';
import { createRandom, type Random } from '../src/random';
import { sigmoid } from '../src/stats';

/**
 * Synthetic players for the «10 answers are enough» proof (ТЗ §9.5). Deliberately NOT the algorithm's own model:
 * utilities come from archetypes written over raw dish attributes with thresholds and interactions (spicy × Asian,
 * sweet × breakfast, fried × meat), latent tastes the catalog does not describe (hidden dish factors such as garlic or
 * cilantro), a dish quality shared by everyone, a person–dish idiosyncrasy, a lapse rate and familiarity-driven skips.
 */

export const ARCHETYPES = [
  'traditional',
  'meatLover',
  'healthFocused',
  'vegetarianLeaning',
  'veganLeaning',
  'sweetTooth',
  'spicyAsian',
  'pickyNeophobic',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/**
 * Population shares — an engineering mix informed by Russian survey data (research/R15 §7): traditional cuisine
 * dominates, a sizeable minority loves Asian food, vegetarians are a few per cent.
 */
export const ARCHETYPE_SHARES: Readonly<Record<Archetype, number>> = {
  traditional: 0.26,
  meatLover: 0.15,
  healthFocused: 0.14,
  vegetarianLeaning: 0.05,
  veganLeaning: 0.02,
  sweetTooth: 0.12,
  spicyAsian: 0.13,
  pickyNeophobic: 0.13,
};

const HIDDEN_FACTORS = 4;
const EAST_ASIAN = new Set(['japanese', 'chinese', 'korean', 'southeastAsian']);
const EXOTIC = new Set([...EAST_ASIAN, 'indian', 'mexican', 'middleEastern']);
const SLAVIC = new Set(['russian', 'eastEuropean']);

/** Raw attributes the simulator reasons about (its own view, not φ). */
type Attributes = {
  meat: number;
  redMeat: number;
  poultry: number;
  fish: number;
  seafood: number;
  vegetarian: number;
  vegan: number;
  dairyEggsMain: number;
  plantProtein: number;
  sweet: number;
  spicy: number;
  rich: number;
  veg: number;
  familiar: number;
  fried: number;
  light: number;
  soup: number;
  dessert: number;
  baking: number;
  breakfast: number;
  salad: number;
  eastAsian: number;
  exotic: number;
  slavic: number;
  grilled: number;
  /** Hidden «ingredient» factors: real tastes the catalog's features cannot see. */
  hidden: number[];
};

const centred = (value: number) => (value - 0.5) * 2;

export function dishAttributes(dishes: readonly Dish[], seed: number): Attributes[] {
  const random = createRandom(seed ^ 0x5eed);
  return dishes.map((dish) => {
    const flags = dietFlags(dish);
    const has = (method: string) => (dish.cookingMethods.includes(method as never) ? 1 : 0);
    return {
      meat: flags.meat ? 1 : 0,
      redMeat: dish.proteins.some((p) => p === 'beef' || p === 'pork' || p === 'lamb') ? 1 : 0,
      poultry: dish.proteins.includes('poultry') ? 1 : 0,
      fish: dish.proteins.includes('fish') ? 1 : 0,
      seafood: dish.proteins.includes('seafood') ? 1 : 0,
      vegetarian: flags.vegetarian ? 1 : 0,
      vegan: flags.vegan ? 1 : 0,
      dairyEggsMain: dish.proteins[0] === 'dairy' || dish.proteins[0] === 'eggs' ? 1 : 0,
      plantProtein: dish.proteins.some((p) => p === 'legumes' || p === 'tofu') ? 1 : 0,
      sweet: centred(dish.traits.sweetness),
      spicy: dish.traits.spiciness,
      rich: centred(dish.traits.richness),
      veg: centred(dish.traits.vegShare),
      familiar: centred(dish.traits.familiarityRu),
      fried: Math.max(has('fried'), has('deepFried')),
      light: has('steamed') || has('raw') ? 1 : 0,
      soup: dish.course === 'soup' ? 1 : 0,
      dessert: dish.course === 'dessert' ? 1 : 0,
      baking: dish.course === 'baking' ? 1 : 0,
      breakfast: dish.course === 'breakfast' ? 1 : 0,
      salad: dish.course === 'salad' ? 1 : 0,
      eastAsian: EAST_ASIAN.has(dish.cuisine) ? 1 : 0,
      exotic: EXOTIC.has(dish.cuisine) ? 1 : 0,
      slavic: SLAVIC.has(dish.cuisine) ? 1 : 0,
      grilled: has('grilled'),
      hidden: Array.from({ length: HIDDEN_FACTORS }, () => random.normal()),
    };
  });
}

/** Archetype utility over raw attributes — with thresholds and interactions on purpose. */
function archetypeUtility(archetype: Archetype, a: Attributes): number {
  switch (archetype) {
    case 'traditional':
      return (
        1.3 * a.slavic +
        0.6 * a.soup +
        0.4 * a.baking +
        0.5 * a.familiar -
        0.9 * a.eastAsian -
        0.8 * a.spicy -
        0.6 * a.seafood
      );
    case 'meatLover':
      return (
        1.6 * a.meat +
        0.6 * a.redMeat +
        0.5 * a.fried * a.meat +
        0.4 * a.grilled -
        // A main course without meat is a disappointment, a vegetarian dessert is not.
        1.0 * (1 - a.meat) * (1 - a.dessert - a.baking - a.breakfast > 0 ? 1 : 0) -
        0.5 * a.salad
      );
    case 'healthFocused':
      return (
        1.2 * a.veg -
        1.1 * a.rich -
        0.9 * a.fried +
        0.6 * a.fish +
        0.5 * a.light -
        0.7 * a.dessert +
        0.3 * a.salad
      );
    case 'vegetarianLeaning':
      // A threshold, not a weight: any meat at all is out.
      return -3.2 * a.meat - 1.2 * (a.fish + a.seafood) + 0.8 * a.veg + 0.6 * a.plantProtein;
    case 'veganLeaning':
      return (
        -3.5 * a.meat -
        2.2 * (a.fish + a.seafood) -
        1.6 * (1 - a.vegan) * (1 - a.meat) +
        0.9 * a.veg +
        0.8 * a.plantProtein
      );
    case 'sweetTooth':
      return (
        1.4 * a.sweet +
        1.0 * a.dessert +
        0.6 * a.baking +
        0.6 * a.sweet * a.breakfast -
        0.5 * a.spicy -
        0.3 * a.veg
      );
    case 'spicyAsian':
      return (
        1.4 * a.exotic +
        0.6 * a.eastAsian +
        1.2 * a.spicy +
        0.8 * a.spicy * a.exotic +
        0.4 * a.seafood -
        0.4 * a.slavic
      );
    case 'pickyNeophobic':
      return 2.0 * a.familiar - 1.2 * a.spicy - 0.9 * a.seafood - 0.7 * a.exotic - 0.4 * a.light;
  }
}

export type SyntheticUser = {
  readonly id: number;
  readonly archetypes: readonly (readonly [Archetype, number])[];
  /** True utility of every dish (by catalog index). */
  readonly utility: Float64Array;
  /** Answer noise: P(like) = σ(u / temperature). */
  readonly temperature: number;
  /** Probability of a random answer (inattention). */
  readonly lapse: number;
  readonly neophobia: number;
  readonly indecision: number;
  readonly noisy: boolean;
  readonly skipHeavy: boolean;
  /** Variance of each utility component across the catalog (diagnostics: what can be learned at all). */
  readonly variance: Readonly<
    Record<'quality' | 'archetype' | 'personal' | 'hidden' | 'noise', number>
  >;
};

function varianceOf(values: readonly number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

function pickArchetype(random: Random): Archetype {
  let r = random.next();
  for (const archetype of ARCHETYPES) {
    r -= ARCHETYPE_SHARES[archetype];
    if (r <= 0) return archetype;
  }
  return 'traditional';
}

const lognormal = (random: Random, sd: number) => Math.exp(sd * random.normal());

/**
 * Answer noise is calibrated to test–retest data, not chosen freely (research/R15 §8.3, Wanich et al. 2018):
 * reliability ρ = 0.70 (base) → two repeated answers agree 75–77 %; stress scenarios ρ = 0.55 (69–71 %) and
 * ρ = 0.85 (82–84 %). Every player gets a temperature that makes their own repeat agreement hit their target,
 * plus «random taps» (5 %; R15: 5–10 %, an assumption).
 */
export const NOISE_LEVELS = {
  base: { agreement: 0.76, spread: 0.035, lapse: 0.05 },
  cautious: { agreement: 0.7, spread: 0.025, lapse: 0.08 },
  optimistic: { agreement: 0.83, spread: 0.025, lapse: 0.05 },
} as const;
export type NoiseLevel = keyof typeof NOISE_LEVELS;
/** Players below this repeat agreement form the «noisy» robustness subgroup. */
export const NOISY_BELOW = 0.72;

/** Mean agreement of two repeated answers of a player over the catalog. */
export function repeatAgreement(utility: Float64Array, temperature: number, lapse: number): number {
  let sum = 0;
  for (const u of utility) {
    const p = (1 - lapse) * sigmoid(u / temperature) + lapse / 2;
    sum += p * p + (1 - p) * (1 - p);
  }
  return sum / Math.max(1, utility.length);
}

/** The temperature giving the target agreement (agreement falls monotonically with temperature). */
export function calibrateTemperature(utility: Float64Array, target: number, lapse: number): number {
  let low = 0.01;
  let high = 50;
  if (repeatAgreement(utility, low, lapse) <= target) return low;
  for (let i = 0; i < 60; i += 1) {
    const mid = Math.sqrt(low * high);
    if (repeatAgreement(utility, mid, lapse) > target) low = mid;
    else high = mid;
  }
  return Math.sqrt(low * high);
}

export function createPopulation(
  dishes: readonly Dish[],
  count: number,
  seed: number,
  noise: NoiseLevel = 'base',
): SyntheticUser[] {
  const level = NOISE_LEVELS[noise];
  const attributes = dishAttributes(dishes, seed);
  const random = createRandom(seed);
  // Dish quality shared by everyone: around its popularity, with an idiosyncrasy the catalog does not know.
  const quality = dishes.map(
    (dish) => 1.6 * centred(dish.traits.popularityRu) + 0.45 * random.normal(),
  );
  const users: SyntheticUser[] = [];
  for (let id = 0; id < count; id += 1) {
    const primary = pickArchetype(random);
    const archetypes: [Archetype, number][] = [[primary, 1]];
    if (random.next() < 0.6) {
      let secondary = pickArchetype(random);
      if (secondary === primary) secondary = pickArchetype(random);
      if (secondary !== primary) {
        archetypes[0] = [primary, 0.65];
        archetypes.push([secondary, 0.35]);
      }
    }
    const strength = archetypes.map(([a, w]) => [a, w * lognormal(random, 0.3)] as const);
    const bias = 0.6 * random.normal();
    const conformity = 0.5 + 0.7 * random.next();
    const hiddenLoadings = Array.from({ length: HIDDEN_FACTORS }, () => 0.55 * random.normal());
    // Personal course and cuisine likes outside any archetype.
    const personal = {
      soup: 0.4 * random.normal(),
      salad: 0.4 * random.normal(),
      dessert: 0.4 * random.normal(),
      breakfast: 0.4 * random.normal(),
      fish: 0.5 * random.normal(),
      poultry: 0.4 * random.normal(),
      spicy: 0.4 * random.normal(),
      rich: 0.4 * random.normal(),
    };
    const utility = new Float64Array(dishes.length);
    const parts = {
      quality: [] as number[],
      archetype: [] as number[],
      personal: [] as number[],
      hidden: [] as number[],
      noise: [] as number[],
    };
    attributes.forEach((a, d) => {
      const q = conformity * (quality[d] ?? 0);
      let arch = 0;
      for (const [archetype, weight] of strength) arch += weight * archetypeUtility(archetype, a);
      const pers =
        personal.soup * a.soup +
        personal.salad * a.salad +
        personal.dessert * a.dessert +
        personal.breakfast * a.breakfast +
        personal.fish * a.fish +
        personal.poultry * a.poultry +
        personal.spicy * a.spicy +
        personal.rich * a.rich;
      let hid = 0;
      a.hidden.forEach((h, f) => {
        hid += (hiddenLoadings[f] ?? 0) * h;
      });
      const noise = 0.5 * random.normal();
      parts.quality.push(q);
      parts.archetype.push(arch);
      parts.personal.push(pers);
      parts.hidden.push(hid);
      parts.noise.push(noise);
      utility[d] = bias + q + arch + pers + hid + noise;
    });
    const target = Math.min(0.9, Math.max(0.62, level.agreement + level.spread * random.normal()));
    const temperature = calibrateTemperature(utility, target, level.lapse);
    const noisy = target < NOISY_BELOW;
    const picky = archetypes.some(([a]) => a === 'pickyNeophobic');
    const neophobia = (picky ? 2 : 1) * lognormal(random, 0.45);
    users.push({
      id,
      archetypes,
      utility,
      temperature,
      lapse: level.lapse,
      neophobia,
      indecision: 0.5 + random.next(),
      noisy,
      skipHeavy: neophobia > 1.8,
      variance: {
        quality: varianceOf(parts.quality),
        archetype: varianceOf(parts.archetype),
        personal: varianceOf(parts.personal),
        hidden: varianceOf(parts.hidden),
        noise: varianceOf(parts.noise),
      },
    });
  }
  return users;
}

export type SimAnswer = 'like' | 'dislike' | 'skip';

/** One answer of a synthetic player to a card. */
export function answerCard(
  user: SyntheticUser,
  dish: Dish,
  dishIndex: number,
  random: Random,
): SimAnswer {
  const u = user.utility[dishIndex] ?? 0;
  const unfamiliar = 1 - dish.traits.familiarityRu;
  const pSkip = sigmoid(
    -3 + 3 * unfamiliar * user.neophobia + 1.2 * user.indecision * Math.exp(-u * u),
  );
  if (random.next() < pSkip) return 'skip';
  if (random.next() < user.lapse) return random.next() < 0.5 ? 'like' : 'dislike';
  return random.next() < sigmoid(u / user.temperature) ? 'like' : 'dislike';
}

/** The probability of «like» the player would actually give (for the Brier score). */
export function likeChance(user: SyntheticUser, dishIndex: number): number {
  const p = sigmoid((user.utility[dishIndex] ?? 0) / user.temperature);
  return (1 - user.lapse) * p + user.lapse * 0.5;
}
