import { z } from 'zod';
import { PLAN_IDS } from './constants';

export { BILLING_PERIODS, PLAN_IDS, type BillingPeriod, type PlanId } from './constants';

const text = z.string().trim().min(1);
/** Lines as in the mockup: rendered with explicit breaks on desktop, joined on small screens. */
const lines = z.array(text).min(1);

const featureIcon = z.enum(['school', 'sparkles', 'listDetails', 'shieldCheck']);
const imageKey = z.enum(['teamLogo', 'projectLogo', 'teamCard']);

/** A link of the project card: not working yet — a press says «Мы работаем над этим». */
const link = z.object({ label: text });

/** A price for each billing period: the amount and the words after it («навсегда», «в месяц»). */
const price = z.object({ amount: text, per: text });

const plan = z.object({
  id: z.enum(PLAN_IDS),
  name: text,
  tagline: text,
  prices: z.object({ month: price, year: price }),
  /** Each feature as lines, broken where the mockup breaks them. */
  features: z.array(lines).min(1),
});

export const siteContentSchema = z.object({
  meta: z.object({
    lang: z.literal('ru'),
    title: text,
    description: text,
  }),
  brand: z.object({
    name: text,
    /** Temporary logo: Tabler icon name, replace with an image key when the team sends the logo. */
    logoIcon: z.literal('apple'),
  }),
  hero: z.object({
    aboutButton: text,
    pricingButton: text,
    titleLines: lines,
    leadLines: lines,
    cta: z.object({ label: text, href: z.string().startsWith('#') }),
    featuresLabel: text,
    features: z.array(z.object({ title: text, textLines: lines, icon: featureIcon })).length(4),
  }),
  about: z.object({
    title: text,
    backLabel: text,
    team: z.object({
      label: text,
      nameLines: lines,
      leadLines: lines,
      image: imageKey,
      imageAlt: text,
      more: text,
      moreLabel: text,
    }),
    project: z.object({
      label: text,
      nameLines: lines,
      leadLines: lines,
      /** The project logo is the site's apple (Tabler) on a white tile. */
      logoAlt: text,
      links: z.array(link).length(2),
    }),
  }),
  /** The landing's part of the quiz: the header pill turns into «Выйти ×» while the quiz chunk loads. */
  quizShell: z.object({ exit: text, exitLabel: text, loading: text, loadError: text, retry: text }),
  teamDialog: z.object({
    nameLines: lines,
    nameTranslationLines: lines,
    leadLines: lines,
    membersLabel: text,
    members: z.array(z.array(text).min(1)).length(2),
    close: text,
  }),
  /**
   * «Цены»: a part of the page of its own (the team's mockups «цены дизайн», 22.10). Nothing can be bought yet: choosing
   * a plan says so.
   */
  pricing: z.object({
    title: text,
    heading: text,
    lead: text,
    close: text,
    periodsLabel: text,
    periods: z.object({ month: text, year: text, yearDiscount: text }),
    plansLabel: text,
    /** The accessible name of a plan card's button: «{name}» is replaced. */
    choose: text.includes('{name}'),
    plans: z.tuple([plan, plan]),
    /** Premium's «Ещё...»: the rest of its features on the blurred card. */
    more: z.object({ label: text, open: text, close: text, features: z.array(lines).min(1) }),
  }),
  /** Short messages (Toast). */
  notices: z.object({ workingOnIt: text, noPayment: text, loadError: text }),
  food: z.object({
    names: z.record(z.string(), text),
  }),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
export type FeatureIcon = z.infer<typeof featureIcon>;
export type ImageKey = z.infer<typeof imageKey>;
