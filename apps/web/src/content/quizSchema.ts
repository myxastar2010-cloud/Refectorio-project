import { z } from 'zod';

const text = z.string().trim().min(1);
/** A template with named slots: «Осталось оценить: {n}». */
const template = (...slots: readonly string[]) =>
  text.refine((value) => slots.every((slot) => value.includes(`{${slot}}`)), {
    message: `needs ${slots.map((s) => `{${s}}`).join(', ')}`,
  });
const option = z.object({ label: text, description: text.optional() });
const plural = z.object({ one: text, few: text, many: text });

export const NOTICE_IDS = [
  'teenGoals',
  'childFamily',
  'toddler',
  'underweightLose',
  'noValidTarget',
  'olderAdult',
  'pregnancyLactation',
  'eatingDisorder',
  'diabetesKeto',
  'ketoUnavailable',
  'refused',
  'insulinUnknown',
  'severeTraces',
  'teenHealth',
  'diabetesGoal',
] as const;
export type NoticeId = (typeof NOTICE_IDS)[number];

export const HEALTH_CHIP_IDS = [
  'diabetes',
  'hypertension',
  'hypothyroidism',
  'insulinResistance',
  'kidneyDisease',
  'eatingDisorder',
  'warfarin',
  'maoi',
  'pku',
  'pregnancy',
  'lactation',
] as const;
export type HealthChipId = (typeof HEALTH_CHIP_IDS)[number];

export const ALLERGEN_CHIP_IDS = [
  'lactose',
  'gluten',
  'peanut',
  'fish',
  'mollusc',
  'soy',
  'treeNut',
  'milk',
  'egg',
  'crustacean',
  'sesame',
  // Reached only through the «+» field (synonyms): they appear as chips once found.
  'celery',
  'mustard',
  'sulphites',
  'lupin',
  'aspartame',
] as const;
export type AllergenChipId = (typeof ALLERGEN_CHIP_IDS)[number];

const chipMap = <T extends readonly [string, ...string[]]>(ids: T) =>
  z.object(Object.fromEntries(ids.map((id) => [id, text])) as Record<T[number], typeof text>);

export const quizContentSchema = z.object({
  common: z.object({
    back: text,
    privacyLink: text,
    next: text,
    done: text,
    choose: text,
    addOther: text,
    close: text,
    understood: text,
    remove: template('item'),
    progressLabel: text,
    progressValue: template('n', 'total'),
    resumeToast: template('n'),
    startOver: text,
    kg: text,
    cm: text,
    years: plural,
    stepAnnounce: template('n', 'total', 'title'),
    counter: template('left'),
  }),
  taste: z.object({
    title: text,
    dislike: text,
    skip: text,
    like: text,
    live: z.object({
      like: template('dish', 'n'),
      dislike: template('dish', 'n'),
      skip: template('dish'),
      undo: template('dish'),
      card: template('dish'),
      done: text,
    }),
    credit: template('author', 'provider'),
    creditLabel: template('author', 'provider'),
    skipHint: text,
    exhausted: text,
    exhaustedContinue: text,
    remembered: template('list'),
    hintNames: z.object({
      likesMeat: text,
      likesFish: text,
      likesSoups: text,
      likesVegetables: text,
      likesSpicy: text,
      sweetTooth: text,
      likesBaking: text,
      likesAsian: text,
      likesPasta: text,
    }),
    and: text,
    swipeHint: text,
    debugTitle: text,
    debugLiked: text,
    debugDisliked: text,
  }),
  body: z.object({
    title: text,
    sex: text,
    age: text,
    height: text,
    sexValues: z.object({ male: text, female: text }),
    sexTitle: text,
    ageTitle: text,
    heightTitle: text,
    familyConfirm: text,
    implausible: text,
  }),
  goal: z.object({
    title: text,
    options: z.object({ lose: option, gain: option, maintain: option }),
  }),
  goalSetup: z.object({
    title: text,
    titleMaintain: text,
    current: text,
    target: text,
    currentTitle: text,
    targetTitle: text,
    recommended: template('min', 'max'),
    limitLose: template('min'),
    limitGain: template('max'),
    limitDirectionLose: text,
    limitDirectionGain: text,
    typedClamped: template('value'),
    typedInvalid: text,
  }),
  foodStyle: z.object({
    title: text,
    options: z.object({ omnivore: option, pescatarian: option, vegetarian: option, vegan: option }),
    suggested: text,
  }),
  macroProfile: z.object({
    title: text,
    options: z.object({
      recommended: option,
      highProtein: option,
      lowCarb: option,
      keto: option,
      lowFat: option,
    }),
    unavailable: text,
  }),
  yesNo: z.object({ yes: text, no: text }),
  health: z.object({
    title: text,
    conditionsTitle: text,
    chips: chipMap(HEALTH_CHIP_IDS),
    addTitle: text,
    addPlaceholder: text,
    insulinQuestion: text,
    insulinOptions: z.object({ yes: text, no: text, unknown: text }),
    trimesterQuestion: text,
    trimesters: z.object({ trimester1: text, trimester2: text, trimester3: text }),
    lactationQuestion: text,
    lactationPeriods: z.object({ months0to6: text, months7to12: text }),
    notes: z.object({
      hypertension: text,
      hypothyroidism: text,
      insulinResistance: text,
      warfarin: text,
      maoi: text,
    }),
  }),
  allergy: z.object({
    title: text,
    allergensTitle: text,
    chips: chipMap(ALLERGEN_CHIP_IDS),
    addTitle: text,
    addPlaceholder: text,
    severe: text,
    matched: template('chips'),
  }),
  dislikes: z.object({
    title: text,
    textTitle: text,
    placeholder: text,
  }),
  activity: z.object({
    title: text,
    options: z.object({ none: text, '1to2': text, '3to4': text, '5to6': text, daily: text }),
    strengthTitle: text,
  }),
  lifestyle: z.object({
    title: text,
    options: z.object({
      mostlySitting: text,
      sometimesStanding: text,
      mostlyStanding: text,
      movingAllDay: text,
      physicalLabour: text,
    }),
  }),
  notes: z.object({ title: text, placeholder: text }),
  notices: z.object(
    Object.fromEntries(NOTICE_IDS.map((id) => [id, text])) as Record<NoticeId, typeof text>,
  ),
  helplines: z.object({ title: text, minors: text, adults: text, checked: text }),
  adjustments: z.object({
    title: text,
    goalToMaintain: text,
    ketoToRecommended: text,
  }),
  privacy: z.object({
    title: text,
    items: z.array(text).min(4),
    deleteAnswers: text,
    deleteConfirm: text,
    deleteYes: text,
    deleteNo: text,
    deleted: text,
    credits: text,
  }),
  finale: z.object({
    captions: z.array(z.object({ text, icon: z.string().min(1) })).min(6),
    captionsCalm: z.object({ replace: text, with: text }),
    honest: text,
    generatingLabel: text,
    refused: z.object({
      title: text,
      text,
      doctor: text,
      change: text,
      home: text,
    }),
    revealPlaceholder: text,
    debugTitle: text,
  }),
});

export type QuizContent = z.infer<typeof quizContentSchema>;
