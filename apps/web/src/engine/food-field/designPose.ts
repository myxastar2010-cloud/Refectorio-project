/**
 * Food exactly as on mockup №1 (`?pose=design`), in 1920×1080 frame px. Centre, sprite edge and CSS rotation were
 * fitted by silhouette matching (refectorio-workspace/design/analysis/02_food_pose.py). The waffle from the mockup is
 * not in the resources — a donut takes its place (Figma frame of the waffle: centre 968.6 × 391.6).
 */
export type PoseItem = {
  readonly slug: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly sizePx: number;
  readonly rotateDeg: number;
};

export const DESIGN_POSE: readonly PoseItem[] = [
  { slug: 'strawberry', centerX: 505.5, centerY: 112.5, sizePx: 184.5, rotateDeg: 49.25 },
  { slug: 'broccoli', centerX: 1662, centerY: 154, sizePx: 184.5, rotateDeg: -11.25 },
  { slug: 'donut', centerX: 968.6, centerY: 391.6, sizePx: 162, rotateDeg: -15 },
  { slug: 'hotdog', centerX: 1375, centerY: 547, sizePx: 172.5, rotateDeg: 68.25 },
  { slug: 'salad', centerX: 692, centerY: 739, sizePx: 183, rotateDeg: 48 },
  { slug: 'broccoli', centerX: 155, centerY: 744, sizePx: 162, rotateDeg: -4 },
  { slug: 'burger', centerX: 1758, centerY: 786, sizePx: 186, rotateDeg: -33.75 },
];
