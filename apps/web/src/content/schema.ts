import { z } from 'zod';

const text = z.string().trim().min(1);
/** Lines as in the mockup: rendered with explicit breaks on desktop, joined on small screens. */
const lines = z.array(text).min(1);

const featureIcon = z.enum(['school', 'sparkles', 'pencil', 'shieldCheck']);
const imageKey = z.enum(['teamLogo', 'projectLogo', 'teamCard']);

/** A link of the project card: not working yet — a press says «Мы работаем над этим». */
const link = z.object({ label: text });

export const PLAN_IDS = ['free', 'premium', 'business'] as const;

const plan = z.object({
  id: z.enum(PLAN_IDS),
  name: text,
  price: text,
  period: text,
  /** A second price line (the yearly Premium). */
  note: text.optional(),
  tagline: text,
  badge: text.optional(),
  features: z.array(text).min(1),
  action: text,
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
  /** «Цены»: the plans of the business model (the team's tables, 17.10). Nothing can be bought yet. */
  pricing: z.object({
    title: text,
    lead: text,
    plansLabel: text,
    close: text,
    plans: z.array(plan).length(3),
  }),
  /** Short messages (Toast). */
  notices: z.object({ workingOnIt: text, noPayment: text, loadError: text }),
  food: z.object({
    names: z.record(z.string(), text),
  }),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
export type FeatureIcon = z.infer<typeof featureIcon>;
export type PlanId = (typeof PLAN_IDS)[number];
export type ImageKey = z.infer<typeof imageKey>;
