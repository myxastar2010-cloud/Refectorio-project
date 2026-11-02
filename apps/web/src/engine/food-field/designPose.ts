/**
 * Food exactly as on the rebrand's landing mockup (`?pose=design`), in 1920×1080 frame px. Centre, sprite edge and CSS
 * rotation are fitted by silhouette overlap, IoU 0.97–0.98 (scripts/fit-food-pose.mjs).
 */
export type PoseItem = {
  readonly slug: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly sizePx: number;
  readonly rotateDeg: number;
};

export const DESIGN_POSE: readonly PoseItem[] = [
  { slug: 'avocado', centerX: 516.5, centerY: 96.5, sizePx: 143, rotateDeg: 23 },
  { slug: 'croissant', centerX: 1264, centerY: 121.5, sizePx: 143, rotateDeg: 0 },
  { slug: 'salad', centerX: 996.5, centerY: 363, sizePx: 143, rotateDeg: 38 },
  { slug: 'apple', centerX: 659.5, centerY: 566, sizePx: 143, rotateDeg: 0 },
  { slug: 'cheese', centerX: 1003.5, centerY: 748, sizePx: 144.5, rotateDeg: -53 },
  { slug: 'corn', centerX: 193.5, centerY: 780.5, sizePx: 143, rotateDeg: 81 },
];
