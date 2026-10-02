import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

export const siteContentSchema = z.object({
  meta: z.object({
    lang: z.literal('ru'),
    title: nonEmpty,
    description: nonEmpty,
  }),
  brand: z.object({
    name: nonEmpty,
  }),
  comingSoon: z.object({
    heading: nonEmpty,
    lead: nonEmpty,
    team: nonEmpty,
  }),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
