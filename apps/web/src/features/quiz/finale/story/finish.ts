import { STORY } from '../../../../motion/tokens';
import { easeInOut, easeOut, span, type Palette } from './draw';
import { GLOW_STOPS, rgbOf } from './laterScenes';
import type { MorphPlan } from './morph';
import type { SceneScript } from './scenes';

/**
 * The end of the story when the menu is ready (ТЗ фаза 4 §1): the pot dissolves into its points, which spiral into the
 * centre and become a bright pulse — or, from the dots loop, the disc contracts into it. The reveal wave starts from
 * the pulse (`STORY.finish.peakS`).
 */
export type FinishKind = 'gather' | 'contract';

const SPRITE_PX = 128;

/** The pulse's light, painted once into a small sprite (a gradient per frame costs far more, see dotsScene). */
export function pulseSprite(accent: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_PX;
  canvas.height = SPRITE_PX;
  const g2 = canvas.getContext('2d');
  if (g2) {
    const [r, g, b] = rgbOf(accent);
    const half = SPRITE_PX / 2;
    const gradient = g2.createRadialGradient(half, half, 0, half, half, half);
    for (const [at, a] of GLOW_STOPS) {
      gradient.addColorStop(at, `rgb(${String(r)} ${String(g)} ${String(b)} / ${a.toFixed(3)})`);
    }
    g2.fillStyle = gradient;
    g2.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  }
  return canvas;
}

function drawPulse(ctx: CanvasRenderingContext2D, t: number, sprite: HTMLCanvasElement): void {
  const f = STORY.finish;
  const grow = easeOut(span(t, f.pulseFromS, f.pulseS));
  if (grow <= 0) return;
  const r = f.pulseR * (0.2 + 0.8 * grow);
  ctx.globalAlpha = grow;
  ctx.drawImage(sprite, -r, -r, 2 * r, 2 * r);
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.92 * grow;
  ctx.beginPath();
  ctx.arc(0, 0, f.coreR * grow, 0, 2 * Math.PI);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** The pot's points (the pot → dots plan's `from`) spiral into the centre while the drawing fades. */
export function drawGather(
  ctx: CanvasRenderingContext2D,
  t: number,
  plan: MorphPlan,
  pot: SceneScript,
  palette: Palette,
  sprite: HTMLCanvasElement,
): void {
  const f = STORY.finish;
  const fade = easeInOut(span(t, 0, f.fadeOutS));
  if (fade < 1) pot.draw(ctx, pot.durationS, { reveal: null, alpha: 1 - fade });
  const appear = easeOut(span(t, 0, f.appearS));
  ctx.fillStyle = palette[2];
  for (let k = 0; k < plan.count; k += 1) {
    const g = easeInOut(span(t, f.gatherFromS + (plan.order[k] ?? 0) * f.gatherSweepS, f.gatherS));
    const alpha = appear * (1 - span(g, 0.78, 0.22));
    if (alpha <= 0) continue;
    const angle = f.turn * g;
    const cos = Math.cos(angle) * (1 - g);
    const sin = Math.sin(angle) * (1 - g);
    const fx = plan.from[2 * k] ?? 0;
    const fy = plan.from[2 * k + 1] ?? 0;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(fx * cos - fy * sin, fx * sin + fy * cos, STORY.dotR * (1 - 0.5 * g), 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawPulse(ctx, t, sprite);
}

/** The dots' disc (at its own loop time `dotsT`) contracts into the pulse. */
export function drawContract(
  ctx: CanvasRenderingContext2D,
  t: number,
  dots: SceneScript,
  dotsT: number,
  sprite: HTMLCanvasElement,
): void {
  const c = easeInOut(span(t, 0, STORY.finish.contractS));
  const scale = 1 - 0.94 * c;
  ctx.save();
  ctx.scale(scale, scale);
  dots.draw(ctx, dotsT, { reveal: null, alpha: 1 - span(c, 0.55, 0.45) });
  ctx.restore();
  drawPulse(ctx, t, sprite);
}
