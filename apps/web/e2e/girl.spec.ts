import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, settled } from './helpers';

/** Stage 4, §1.5–1.6: the animated girl and the food that goes around her. */

const generated = new URL('../src/assets/generated/', import.meta.url);
const girlMask = JSON.parse(readFileSync(new URL('girl-mask.json', generated), 'utf8')) as {
  readonly grid: number;
  readonly rows: readonly string[];
};
const manifest = JSON.parse(readFileSync(new URL('manifest.json', generated), 'utf8')) as {
  readonly food: {
    readonly maskSize: number;
    readonly items: readonly { readonly slug: string; readonly mask: readonly string[] }[];
  };
};

const art = (page: Page) => page.locator('.hero-girl-art');

async function boxOf(page: Page) {
  const box = await art(page).boundingBox();
  if (!box) throw new Error('no girl on the page');
  return box;
}

test.describe('the girl', () => {
  test('the still is there at once, and the video takes its place without moving a pixel', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'WebKit on Windows and Linux has no codecs for it');
    const errors = collectErrors(page);
    await page.goto('./?seed=1');
    await expect(page.locator('.hero-girl-still')).toBeVisible();
    const before = await boxOf(page);
    expect(before.width).toBeGreaterThan(200);
    await expect(art(page)).toHaveAttribute('data-girl', 'video', { timeout: 20_000 });
    const after = await boxOf(page);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(0.5);
    }
    await expect(page.locator('.hero-girl-still')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('the still and the video’s first frame are the same picture', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'one engine is enough: a property of the two files');
    await page.goto('./?pose=design&freeze=1&seed=1');
    await expect(art(page)).toHaveAttribute('data-girl', 'video', { timeout: 20_000 });
    const box = await boxOf(page);
    await page.evaluate(async () => {
      const video = document.querySelector('video');
      if (!video) throw new Error('no video');
      video.pause();
      await new Promise((resolve) => {
        video.onseeked = resolve;
        video.currentTime = 0;
      });
    });
    const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
    const shot = () => page.screenshot({ clip, type: 'png' });
    const videoFrame = await shot();
    await art(page).evaluate((element) => {
      (element as HTMLElement).dataset.girl = 'still';
    });
    await expect(page.locator('.hero-girl-still')).toBeVisible();
    const still = await shot();
    const difference = await page.evaluate(
      async ([one, two]) => {
        const pixels = async (base64: string) => {
          const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
          const bitmap = await createImageBitmap(blob);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d');
          context?.drawImage(bitmap, 0, 0);
          return context?.getImageData(0, 0, bitmap.width, bitmap.height).data;
        };
        const [a, b] = [await pixels(one ?? ''), await pixels(two ?? '')];
        if (!a || !b) return 255;
        let sum = 0;
        for (let at = 0; at < a.length; at += 4) sum += Math.abs((a[at] ?? 0) - (b[at] ?? 0));
        return sum / (a.length / 4);
      },
      [videoFrame.toString('base64'), still.toString('base64')],
    );
    // The mean difference over her box, in levels of 255: an eye sees no change at the swap.
    expect(difference).toBeLessThan(2.5);
  });

  test('no edge of her box shows on the page', async ({ page }) => {
    await page.goto('./?pose=design&freeze=1&seed=1');
    await expect(page.locator('.hero-girl-still')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const box = await boxOf(page);
    const band = 6;
    const clip = {
      x: box.x - band,
      y: box.y - band,
      width: box.width + 2 * band,
      height: box.height + 2 * band,
    };
    const png = await page.screenshot({ clip, type: 'png' });
    const lowest = await page.evaluate(
      async ({ base64, inset }) => {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        context?.drawImage(bitmap, 0, 0);
        const data = context?.getImageData(0, 0, bitmap.width, bitmap.height).data;
        if (!data) return 0;
        // The page colour on either side of the box edge: the top, left and right bands (the floor lines are not there).
        let worst = 0;
        for (let y = 0; y < bitmap.height; y += 1) {
          for (let x = 0; x < bitmap.width; x += 1) {
            const inBand = y < inset * 2 || x < inset * 2 || x >= bitmap.width - inset * 2;
            if (!inBand) continue;
            const at = (y * bitmap.width + x) * 4;
            worst = Math.max(
              worst,
              Math.abs((data[at] ?? 0) - 254),
              Math.abs((data[at + 1] ?? 0) - 249),
              Math.abs((data[at + 2] ?? 0) - 247),
            );
          }
        }
        return worst;
      },
      { base64: png.toString('base64'), inset: band },
    );
    expect(lowest).toBeLessThanOrEqual(3);
  });

  test('reduced motion: the still, and the video is never requested', async ({ page }) => {
    const videos: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('.mp4')) videos.push(request.url());
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?seed=1');
    await expect(page.locator('.hero-girl-still')).toBeVisible();
    await expect(page.locator('.hero-girl-video')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(videos).toEqual([]);
  });

  test('she pauses when part 1 leaves and goes on when it comes back', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'WebKit on Windows and Linux has no codecs for it');
    await page.goto('./?seed=1');
    await expect(art(page)).toHaveAttribute('data-girl', 'video', { timeout: 20_000 });
    const paused = () =>
      page.locator('video').evaluate((video) => (video as HTMLVideoElement).paused);
    expect(await paused()).toBe(false);
    await page.getByRole('button', { name: 'О проекте' }).click();
    await settled(page, 'about');
    await expect.poll(paused).toBe(true);
    await page.goBack();
    await settled(page, 'hero');
    await expect.poll(paused).toBe(false);
  });
});

test.describe('the food goes around her', () => {
  const VIEWPORTS = [
    [1920, 1080],
    [1536, 730],
    [1366, 768],
    [1024, 768],
    [390, 844],
  ] as const;

  for (const [width, height] of VIEWPORTS) {
    test(`2 000 frames at ${String(width)}×${String(height)}: no sprite pixel on her`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'the engine is plain code: one browser is enough');
      await page.setViewportSize({ width, height });
      await page.clock.install();
      // After every frame of the engine: every opaque cell of every sprite against her silhouette.
      await page.addInitScript(
        ({ girl, food }) => {
          const original = window.requestAnimationFrame.bind(window);
          const set = (row: number, column: number) => {
            const digit = Number.parseInt((girl.rows[row] ?? '').charAt(column >> 2) || '0', 16);
            return ((digit >> (3 - (column & 3))) & 1) === 1;
          };
          const masks = new Map(food.items.map((item) => [item.slug, item.mask]));
          const state = { frames: 0, overlap: 0, sawBox: false };
          (window as unknown as { __overlap: typeof state }).__overlap = state;
          const check = () => {
            const hook = (
              window as unknown as {
                __refectorioFood?: {
                  snapshot: () => {
                    slug: string;
                    x: number;
                    y: number;
                    size: number;
                    scale: number;
                    angle: number;
                    hidden: boolean;
                  }[];
                };
              }
            ).__refectorioFood;
            const box = document.querySelector('.hero-girl')?.getBoundingClientRect();
            if (!hook || !box || box.width === 0) return;
            state.sawBox = true;
            state.frames += 1;
            for (const item of hook.snapshot()) {
              if (item.hidden) continue;
              const rows = masks.get(item.slug) ?? [];
              const edge = item.size * item.scale;
              const cos = Math.cos((item.angle * Math.PI) / 180);
              const sin = Math.sin((item.angle * Math.PI) / 180);
              for (let row = 0; row < food.maskSize; row += 1) {
                const bits = Number.parseInt(rows[row] ?? '0', 16);
                for (let column = 0; column < food.maskSize; column += 1) {
                  if (!((bits >>> (food.maskSize - 1 - column)) & 1)) continue;
                  const u = ((column + 0.5) / food.maskSize - 0.5) * edge;
                  const v = ((row + 0.5) / food.maskSize - 0.5) * edge;
                  const x = item.x + u * cos - v * sin;
                  const y = item.y + u * sin + v * cos;
                  const gridX = Math.floor(((x - box.left) / box.width) * girl.grid);
                  const gridY = Math.floor(((y - box.top) / box.height) * girl.grid);
                  if (gridX < 0 || gridY < 0 || gridX >= girl.grid || gridY >= girl.grid) continue;
                  if (set(gridY, gridX)) state.overlap += 1;
                }
              }
            }
          };
          window.requestAnimationFrame = (callback) =>
            original((time) => {
              callback(time);
              check();
            });
        },
        { girl: girlMask, food: manifest.food },
      );
      await page.goto('./?seed=7');
      await page.clock.runFor(2000 * 16);
      const result = await page.evaluate(
        () =>
          (window as unknown as { __overlap: { frames: number; overlap: number; sawBox: boolean } })
            .__overlap,
      );
      expect(result.sawBox).toBe(true);
      expect(result.frames).toBeGreaterThanOrEqual(1900);
      expect(result.overlap).toBe(0);
    });
  }
});
