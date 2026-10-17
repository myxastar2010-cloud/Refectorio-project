// File names of the self-hosted dish photos — the same rule as photoFileBase() in packages/taste-core/src/photos.ts
// (the browser builds the URLs from photo-runtime.json; files.test.mjs checks that both agree).

/** Bump when the crop or the encoding changes: every file gets a new name, so a cached copy is never stale. */
export const PHOTO_PIPELINE_VERSION = 1;

/** Card widths of the self-hosted files (srcset 480w/720w/960w). */
export const WIDTHS = [480, 720, 960];

/** The pre-blurred copy behind the dish info (≈ 64 px wide, stretched by CSS). */
export const BLUR_WIDTH = 64;

const thousandths = (share) => Math.round(share * 1000);

/** `<provider>-<id>-f<x>x<y>-v<version>`: the photo, its crop and the pipeline — nothing else changes the pixels. */
export const photoFileBase = (photo) =>
  `${photo.provider}-${photo.id}-f${thousandths(photo.focal.x)}x${thousandths(photo.focal.y)}-v${PHOTO_PIPELINE_VERSION}`;

/** Every file of one photo: the size ladder in AVIF and WebP plus the blurred copy. */
export const photoFiles = (photo) => {
  const base = photoFileBase(photo);
  return [
    ...WIDTHS.flatMap((width) => [`${base}-${width}.avif`, `${base}-${width}.webp`]),
    `${base}-blur.webp`,
  ];
};
