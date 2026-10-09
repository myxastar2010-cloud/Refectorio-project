import { z } from 'zod';
import { DISH_ID_PATTERN } from '@refectorio/contracts';

/**
 * The committed photo manifest (metadata only — the files never go into git, Pexels licence). Written by
 * scripts/photos/finalize.mjs, read by the quiz (photo chain) and by scripts/photos/materialize.mjs.
 */
export const PHOTO_PROVIDERS = ['pexels', 'unsplash'] as const;

const share = z.number().min(0).max(1);

export const photoSchema = z
  .object({
    provider: z.enum(PHOTO_PROVIDERS),
    id: z.string().min(1),
    pageUrl: z.url(),
    author: z.string().trim().min(1),
    authorUrl: z.url(),
    /** Pexels: the original on the CDN (materialize downloads w=1920). Unsplash: urls.raw with its ixid (hotlink). */
    src: z.url(),
    width: z.int().positive(),
    height: z.int().positive(),
    /** Centre of the 3:4 crop, shares of the image. */
    focal: z.object({ x: share, y: share }),
    avgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    blurhash: z.string().min(6).max(100),
    altRu: z.string().min(8),
    chosenAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Unsplash: when links.download_location was fired (API guidelines). */
    downloadTrackedAt: z.string().nullable().optional(),
  })
  .superRefine((photo, ctx) => {
    if (photo.provider === 'unsplash') {
      const src = new URL(photo.src);
      if (src.hostname !== 'images.unsplash.com' || !src.searchParams.has('ixid')) {
        ctx.addIssue({
          code: 'custom',
          path: ['src'],
          message: 'hotlink images.unsplash.com with ixid',
        });
      }
      for (const key of ['pageUrl', 'authorUrl'] as const) {
        if (!photo[key].includes('utm_source=refectorio')) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'Unsplash credit links need utm' });
        }
      }
    }
    if (photo.provider === 'pexels' && new URL(photo.src).hostname !== 'images.pexels.com') {
      ctx.addIssue({ code: 'custom', path: ['src'], message: 'Pexels CDN only' });
    }
  });

export const photoManifestSchema = z.object({
  version: z.literal(1),
  catalogVersion: z.string(),
  updatedAt: z.string(),
  photos: z.record(
    z.string().regex(DISH_ID_PATTERN),
    z.object({
      primary: photoSchema,
      /** A curated Unsplash photo for a Pexels dish (used when the self-hosted file is missing). */
      fallback: photoSchema.optional(),
    }),
  ),
});

export type DishPhoto = z.infer<typeof photoSchema>;
export type PhotoManifest = z.infer<typeof photoManifestSchema>;
