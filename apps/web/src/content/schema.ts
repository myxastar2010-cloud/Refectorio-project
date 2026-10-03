import { z } from 'zod';

const text = z.string().trim().min(1);
/** Lines as in the mockup: rendered with explicit breaks on desktop, joined on small screens. */
const lines = z.array(text).min(1);

const featureIcon = z.enum(['school', 'sparkles', 'pencil', 'shieldCheck']);
const imageKey = z.enum(['teamLogo', 'teamBackground']);

const link = z.object({
  label: text,
  /** null until the team publishes the address: the link is rendered disabled with a hint. */
  href: z.url().nullable(),
  soonHint: text,
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
    titleLines: lines,
    leadLines: lines,
    cta: z.object({ label: text, href: z.string().startsWith('#'), toast: text }),
    featuresLabel: text,
    features: z.array(z.object({ title: text, textLines: lines, icon: featureIcon })).length(4),
    carouselLabel: text,
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
      image: imageKey,
      imageAlt: text,
      links: z.array(link).length(2),
    }),
  }),
  teamDialog: z.object({
    nameLines: lines,
    leadLines: lines,
    membersLabel: text,
    members: z.array(z.array(text).min(1)).length(2),
    close: text,
  }),
  food: z.object({
    names: z.record(z.string(), text),
  }),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
export type FeatureIcon = z.infer<typeof featureIcon>;
export type ImageKey = z.infer<typeof imageKey>;
