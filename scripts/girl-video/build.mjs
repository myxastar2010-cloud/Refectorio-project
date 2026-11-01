// The hero's animated girl (stage 4, §1.5; D-064): the team's video → mirrored, whitened, seamless loop + its first frame
// + the silhouette for the food. All of it runs in the installed Chrome (HEVC decoding, WebCodecs encoders): no ffmpeg.
//   npm run girl-video [-- --out <folder for trial runs>]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { av1Config, concat, muxMp4, stripTemporalDelimiters } from './mp4.mjs';
import { encode, finishFrames, loadFrames, unionPng, verify } from './page.mjs';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.resolve(
  APP_ROOT,
  '..',
  'Ресурсы для создания',
  'Задание 4',
  'этап 1',
  'девушка анимация.MP4',
);
const ORIGIN = 'https://girl.local';

const LOOP = { fps: 24, from: 279, to: 479, fade: 6 };
/** Margin around the artwork, of its size. */
const CROP_MARGIN = 0.03;
/** The frame's outermost pixels are never used: the video has a coloured column along one side. */
const EDGE = 6;
/** Ink is what differs from the background by more than this. */
const INK_DELTA = 26;
/**
 * The background (≈ #FBF8F3) goes to pure white, the noise around it too. Everything else is scaled by the same factor,
 * so the lines stay black and the green keeps its hue; only values over the knee roll off fast into 255.
 */
const WHITE_MARGIN = 3;
const CURVE = { knee: 247, gain: 6 };
/** A pixel darker than this counts as part of her silhouette (the mask for the food). */
const MASK_LIMIT = 232;
const MASK_GRID = 48;
/** Silhouette grows by this share of her width before it is cut into the grid. */
const MASK_DILATE = 0.012;
/** Each still is its AV1 file's decoded first frame, at the file's own size: the swap changes no pixel. */
const STILLS = [
  { id: 'girl-still-full', video: 'girl-full.av1' },
  { id: 'girl-still-480', video: 'girl-480.av1' },
];
/** The step from the loop's last frame to its first, against a normal step between frames. */
const SEAM_LIMIT = 2.5;

/** Fitted to the budgets (00 §6): full ≈ 1.17 MB AV1 / 1.5 MB H.264 at ≈ 45 dB; hardware H.264 rings at the frame's edge. */
const TARGETS = [
  { id: 'girl-full.av1', family: 'av1', codec: 'av01.0.05M.08', quantizer: 54 },
  { id: 'girl-480.av1', family: 'av1', codec: 'av01.0.04M.08', width: 480, quantizer: 50 },
  { id: 'girl-full.h264', family: 'avc', codec: 'avc1.640028', bitrate: 1_600_000 },
  { id: 'girl-480.h264', family: 'avc', codec: 'avc1.640028', width: 480, bitrate: 700_000 },
];

const { values: args } = parseArgs({
  options: {
    out: {
      type: 'string',
      default: path.join(APP_ROOT, 'apps', 'web', 'src', 'assets', 'generated'),
    },
    /** Intermediate files: the full-size still, the silhouette, decoded first frames, the report. */
    work: { type: 'string', default: path.join(APP_ROOT, '.cache', 'girl') },
    only: { type: 'string' },
    q: { type: 'string' },
    bitrate: { type: 'string' },
    hardware: { type: 'boolean', default: false },
  },
});

const fromBase64 = (text) => new Uint8Array(Buffer.from(text, 'base64'));

/** ISO 23091-2 codes of the colour space Chrome reports for its encoder. */
function colourCodes(space) {
  if (!space) return null;
  const primaries = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
  const transfers = { bt709: 1, smpte170m: 6, linear: 8, 'iec61966-2-1': 13 };
  const matrices = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 };
  return {
    primaries: primaries[space.primaries] ?? 1,
    transfer: transfers[space.transfer] ?? 1,
    matrix: matrices[space.matrix] ?? 1,
    fullRange: Boolean(space.fullRange),
  };
}

function toMp4(encoded, target) {
  const family = target.family;
  const frameDuration = 1;
  const samples = encoded.samples.map((sample) => ({
    data:
      family === 'av1' ? stripTemporalDelimiters(fromBase64(sample.data)) : fromBase64(sample.data),
    key: sample.key,
    duration: frameDuration,
  }));
  const timestamps = encoded.samples.map((sample) => sample.timestamp);
  if (timestamps.some((value, index) => index > 0 && value <= timestamps[index - 1])) {
    throw new Error('The encoder reordered frames: the muxer needs a ctts table for that');
  }
  const config =
    family === 'av1'
      ? av1Config(fromBase64(encoded.samples[0].data), {
          profile: 0,
          level: Number(target.codec.split('.')[2].slice(0, 2)),
          tier: 0,
        })
      : fromBase64(encoded.description);
  return muxMp4({
    codec: family === 'av1' ? 'av01' : 'avc1',
    width: encoded.width,
    height: encoded.height,
    timescale: LOOP.fps,
    samples,
    config,
    colour: colourCodes(encoded.colorSpace),
  });
}

/** The silhouette as rows of bits: non-white pixels, grown a little, cut into the grid (a cell is set if any pixel is). */
async function silhouette(png, width, height) {
  const { data, info } = await sharp(png)
    .greyscale()
    .blur(Math.max(0.3, (width * MASK_DILATE) / 2))
    .threshold(250)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rows = [];
  for (let row = 0; row < MASK_GRID; row += 1) {
    let bits = '';
    const top = Math.floor((row * info.height) / MASK_GRID);
    const bottom = Math.ceil(((row + 1) * info.height) / MASK_GRID);
    for (let column = 0; column < MASK_GRID; column += 1) {
      const left = Math.floor((column * info.width) / MASK_GRID);
      const right = Math.ceil(((column + 1) * info.width) / MASK_GRID);
      let set = false;
      for (let y = top; y < bottom && !set; y += 1) {
        for (let x = left; x < right && !set; x += 1) {
          set = data[(y * info.width + x) * info.channels] < 128;
        }
      }
      bits += set ? '1' : '0';
    }
    rows.push(BigInt(`0b${bits}`).toString(16).padStart(12, '0'));
  }
  return { grid: MASK_GRID, width, height, rows };
}

async function main() {
  await mkdir(args.out, { recursive: true });
  await mkdir(args.work, { recursive: true });
  const source = await readFile(SOURCE);
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage();
    const files = new Map();
    await page.route(`${ORIGIN}/**`, (route) => {
      const url = route.request().url();
      if (url.endsWith('/source.mp4')) {
        return route.fulfill({ status: 200, contentType: 'video/mp4', body: source });
      }
      const file = files.get(url);
      if (file)
        return route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from(file) });
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>girl</title>',
      });
    });
    await page.goto(`${ORIGIN}/`);

    const loaded = await page.evaluate(loadFrames, {
      sourceUrl: `${ORIGIN}/source.mp4`,
      ...LOOP,
      inkDelta: INK_DELTA,
      edge: EDGE,
    });
    const artwork = {
      w: loaded.box.right - loaded.box.left,
      h: loaded.box.bottom - loaded.box.top,
    };
    const marginX = Math.round(artwork.w * CROP_MARGIN);
    const marginY = Math.round(artwork.h * CROP_MARGIN);
    const left = Math.max(EDGE, loaded.box.left - marginX);
    const top = Math.max(EDGE, loaded.box.top - marginY);
    const crop = {
      x: left,
      y: top,
      w: Math.floor((Math.min(loaded.width - EDGE, loaded.box.right + marginX) - left) / 2) * 2,
      h: Math.floor((Math.min(loaded.height - EDGE, loaded.box.bottom + marginY) - top) / 2) * 2,
    };
    const whitePoint = loaded.background.map((value) => value - WHITE_MARGIN);
    const finished = await page.evaluate(finishFrames, {
      ...LOOP,
      crop,
      whitePoint,
      curve: CURVE,
    });
    console.log(JSON.stringify({ loaded, crop, whitePoint, finished }));
    // The loop closes as softly as the video runs: the seam is no bigger step than the ones around it.
    if (finished.seam > finished.medianStep * SEAM_LIMIT) {
      throw new Error(`The loop's seam is too visible: ${JSON.stringify(finished)}`);
    }

    const quantizer = args.q === undefined ? undefined : Number(args.q);
    const report = {};
    const firstFrames = new Map();
    for (const target of TARGETS) {
      if (args.only && !target.id.includes(args.only)) continue;
      const run = {
        ...target,
        ...(quantizer === undefined || target.family === 'avc' ? {} : { quantizer }),
        ...(args.bitrate && target.family === 'avc' ? { bitrate: Number(args.bitrate) } : {}),
        hardware: args.hardware,
      };
      const started = Date.now();
      const encoded = await page.evaluate(encode, { fps: LOOP.fps, target: run });
      const bytes = toMp4(encoded, target);
      await writeFile(path.join(args.out, `${target.id}.mp4`), bytes);
      const url = `${ORIGIN}/${target.id}.mp4`;
      files.set(url, concat([bytes]));
      const check = await page.evaluate(verify, { url, fps: LOOP.fps });
      const firstFrame = fromBase64(check.firstFrame);
      await writeFile(path.join(args.work, `${target.id}.first-frame.png`), firstFrame);
      firstFrames.set(target.id, Buffer.from(firstFrame));
      delete check.firstFrame;
      report[target.id] = {
        kb: Math.round(bytes.length / 1024),
        size: `${encoded.width}×${encoded.height}`,
        keyFrames: encoded.samples.filter((sample) => sample.key).length,
        codec: encoded.codec,
        colour: encoded.colorSpace,
        seconds: Math.round((Date.now() - started) / 1000),
        check,
      };
      console.log(target.id, JSON.stringify(report[target.id]));
    }

    const union = fromBase64(await page.evaluate(unionPng, { limit: MASK_LIMIT }));
    await writeFile(path.join(args.work, 'silhouette.png'), union);
    const mask = await silhouette(Buffer.from(union), crop.w, crop.h);
    await writeFile(path.join(args.out, 'girl-mask.json'), `${JSON.stringify(mask)}\n`);
    for (const { id, video } of STILLS) {
      const frame = firstFrames.get(video);
      if (!frame) continue;
      // sharp writes through a buffer: its own file paths break on the Cyrillic folder (3afe286).
      await writeFile(
        path.join(args.out, `${id}.webp`),
        await sharp(frame).webp({ quality: 92, effort: 6 }).toBuffer(),
      );
      await writeFile(
        path.join(args.out, `${id}.avif`),
        await sharp(frame).avif({ quality: 72, effort: 6 }).toBuffer(),
      );
    }
    await writeFile(
      path.join(args.work, 'report.json'),
      `${JSON.stringify({ loaded, crop, whitePoint, report }, null, 1)}\n`,
    );
  } finally {
    await browser.close();
  }
}

await main();
