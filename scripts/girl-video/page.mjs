/* global document, ImageData, OffscreenCanvas, VideoEncoder, VideoFrame, window */
// Runs inside the installed Chrome (page.evaluate): reads the team's video frame by frame, mirrors, crops and whitens it,
// closes the loop and encodes. Everything is kept on window.__girl between the calls; nothing here touches the disk.

/** Decodes frames [from − fade, to) mirrored. Returns the measured background and the artwork box. */
export async function loadFrames({ sourceUrl, fps, from, to, fade, inkDelta, edge }) {
  const blob = await (await fetch(sourceUrl)).blob();
  const video = document.createElement('video');
  video.muted = true;
  video.src = URL.createObjectURL(blob);
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => {
      reject(new Error(`The video does not open: ${video.error?.message}`));
    };
  });
  const width = video.videoWidth;
  const height = video.videoHeight;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(-1, 0, 0, 1, width, 0);
  const seek = (time) =>
    new Promise((resolve) => {
      video.onseeked = resolve;
      video.currentTime = time;
    });

  const frames = new Map();
  for (let index = from - fade; index < to; index += 1) {
    await seek((index + 0.5) / fps);
    ctx.drawImage(video, 0, 0);
    frames.set(index, ctx.getImageData(0, 0, width, height).data);
  }

  // The background: the median of each channel in the free corners of the first frame. The outer `edge` pixels are left
  // out of everything below: the video has a coloured column along one side.
  const first = frames.values().next().value;
  const values = [[], [], []];
  for (let y = edge; y < edge + 24; y += 1) {
    for (let x = edge; x < width - edge; x += 2) {
      const at = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) values[c].push(first[at + c]);
    }
  }
  const background = values.map((list) => list.sort((a, b) => a - b)[list.length >> 1]);

  // The artwork's box over all the frames.
  const limit = background.map((value) => value - inkDelta);
  let box = { left: width, top: height, right: 0, bottom: 0 };
  for (const data of frames.values()) {
    for (let y = edge; y < height - edge; y += 1) {
      for (let x = edge; x < width - edge; x += 1) {
        const at = (y * width + x) * 4;
        if (data[at] < limit[0] || data[at + 1] < limit[1] || data[at + 2] < limit[2]) {
          box = {
            left: Math.min(box.left, x),
            top: Math.min(box.top, y),
            right: Math.max(box.right, x + 1),
            bottom: Math.max(box.bottom, y + 1),
          };
        }
      }
    }
  }
  window.__girl = { frames, width, height };
  return { width, height, background, box, frames: frames.size };
}

/** Crops, maps the background to pure white and cross-fades the loop's last frames into the ones before its first. */
export function finishFrames({ from, to, fade, crop, whitePoint, curve }) {
  const state = window.__girl;
  const { frames, width } = state;
  const { x, y, w, h } = crop;
  const scale = whitePoint.map((value) => 255 / value);
  // A lookup per channel: linear up to the knee (lines and colours keep their values), then a smooth roll to 255.
  const tables = scale.map((factor) => {
    const table = new Uint8ClampedArray(256);
    for (let value = 0; value < 256; value += 1) {
      const mapped = value * factor;
      table[value] =
        mapped >= curve.knee ? curve.knee + (mapped - curve.knee) * curve.gain : mapped;
    }
    return table;
  });
  const process = (data) => {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row += 1) {
      let from4 = ((y + row) * width + x) * 4;
      let to4 = row * w * 4;
      for (let column = 0; column < w; column += 1) {
        out[to4] = tables[0][data[from4]];
        out[to4 + 1] = tables[1][data[from4 + 1]];
        out[to4 + 2] = tables[2][data[from4 + 2]];
        out[to4 + 3] = 255;
        from4 += 4;
        to4 += 4;
      }
    }
    return out;
  };
  const output = [];
  const length = to - from;
  for (let index = 0; index < length; index += 1) {
    const fromFade = index - (length - fade);
    const own = frames.get(from + index);
    if (fromFade < 0) {
      output.push(process(own));
      continue;
    }
    // The next frame after the loop's end is its first: the last ones lean towards the frames that lead up to it.
    const other = frames.get(from - fade + fromFade);
    const weight = (fromFade + 1) / (fade + 1);
    const blended = new Uint8ClampedArray(own.length);
    for (let at = 0; at < own.length; at += 1) {
      blended[at] = own[at] * (1 - weight) + other[at] * weight;
    }
    output.push(process(blended));
  }
  // The frames before the loop are not needed any more; a frame's own bytes stay for the seam report.
  state.output = output;
  state.size = { w, h };
  frames.clear();
  const meanStep = (a, b) => {
    let sum = 0;
    for (let at = 0; at < a.length; at += 4) sum += Math.abs(a[at + 1] - b[at + 1]);
    return sum / (a.length / 4);
  };
  const steps = output.slice(1).map((data, index) => meanStep(output[index], data));
  const seam = meanStep(output.at(-1), output[0]);
  const medianStep = [...steps].sort((a, b) => a - b)[steps.length >> 1];
  return { frames: output.length, seam, medianStep };
}

/** Encodes the frames at the given width. Returns the chunks as base64, the decoder config and the output size. */
export async function encode({ fps, target }) {
  const { output, size } = window.__girl;
  const width = target.width ?? size.w;
  const height = target.width ? Math.round((size.h * width) / size.w / 2) * 2 : size.h;
  const source = new OffscreenCanvas(size.w, size.h);
  const sourceContext = source.getContext('2d');
  const canvas = new OffscreenCanvas(width, height);
  // willReadFrequently keeps this canvas in software: a VideoFrame of an accelerated one reaches the encoder stretched
  // by 0.26 % along x, and the video would no longer match its still (found on a pattern of known columns).
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const chunks = [];
  let decoderConfig = null;
  let failure = null;
  const encoder = new VideoEncoder({
    output(chunk, metadata) {
      if (metadata?.decoderConfig) decoderConfig ??= metadata.decoderConfig;
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      chunks.push({ bytes, key: chunk.type === 'key', timestamp: chunk.timestamp });
    },
    error(error) {
      failure = error;
    },
  });
  const config = {
    codec: target.codec,
    width,
    height,
    framerate: fps,
    latencyMode: 'quality',
    hardwareAcceleration: target.hardware ? 'prefer-hardware' : 'prefer-software',
    ...(target.bitrate
      ? { bitrate: target.bitrate, bitrateMode: 'variable' }
      : { bitrateMode: 'quantizer' }),
    ...(target.family === 'avc' ? { avc: { format: 'avc' } } : {}),
  };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error(`Encoder not supported: ${JSON.stringify(config)}`);
  encoder.configure(config);

  const frameTimeUs = 1e6 / fps;
  for (let index = 0; index < output.length; index += 1) {
    sourceContext.putImageData(new ImageData(output[index], size.w, size.h), 0, 0);
    context.drawImage(source, 0, 0, width, height);
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(index * frameTimeUs),
      duration: Math.round(frameTimeUs),
      alpha: 'discard',
    });
    const options = { keyFrame: index === 0 };
    if (target.quantizer !== undefined) {
      if (target.family === 'avc') options.avc = { quantizer: target.quantizer };
      else if (target.family === 'av1') options.av1 = { quantizer: target.quantizer };
      else options.vp9 = { quantizer: target.quantizer };
    }
    encoder.encode(frame, options);
    frame.close();
    while (encoder.encodeQueueSize > 4) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  const base64 = (bytes) => {
    let text = '';
    for (let at = 0; at < bytes.length; at += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    }
    return btoa(text);
  };
  return {
    width,
    height,
    samples: chunks.map((chunk) => ({
      data: base64(chunk.bytes),
      key: chunk.key,
      timestamp: chunk.timestamp,
    })),
    description: decoderConfig?.description
      ? base64(new Uint8Array(decoderConfig.description))
      : null,
    colorSpace: decoderConfig?.colorSpace ?? null,
    codec: decoderConfig?.codec ?? target.codec,
  };
}

/** Frame `index` of the finished loop at its full size as a PNG (base64), for the still and the mask. */
export async function framePng(index) {
  const { output, size } = window.__girl;
  const canvas = new OffscreenCanvas(size.w, size.h);
  canvas.getContext('2d').putImageData(new ImageData(output[index], size.w, size.h), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(text);
}

/** Every pixel that is not white in any frame of the loop: one PNG, the silhouette the food must keep away from. */
export async function unionPng({ limit }) {
  const { output, size } = window.__girl;
  const union = new Uint8ClampedArray(size.w * size.h * 4);
  for (const data of output) {
    for (let at = 0; at < data.length; at += 4) {
      if (data[at] < limit || data[at + 1] < limit || data[at + 2] < limit) {
        union[at] = 0;
        union[at + 1] = 0;
        union[at + 2] = 0;
        union[at + 3] = 255;
      } else if (union[at + 3] === 0) {
        union[at] = 255;
        union[at + 1] = 255;
        union[at + 2] = 255;
        union[at + 3] = 254;
      }
    }
  }
  for (let at = 3; at < union.length; at += 4) union[at] = 255;
  const canvas = new OffscreenCanvas(size.w, size.h);
  canvas.getContext('2d').putImageData(new ImageData(union, size.w, size.h), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(text);
}

/** Plays an encoded file back: decodes its first, middle and last frames and compares them with the source frames. */
export async function verify({ url, fps }) {
  const { output, size } = window.__girl;
  const video = document.createElement('video');
  video.muted = true;
  video.src = URL.createObjectURL(await (await fetch(url)).blob());
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => {
      reject(new Error(`The encoded video does not open: ${video.error?.message}`));
    };
  });
  const canvas = new OffscreenCanvas(size.w, size.h);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high';
  const seek = (time) =>
    new Promise((resolve) => {
      video.onseeked = resolve;
      video.currentTime = time;
    });
  const report = [];
  let firstFrame = null;
  for (const index of [0, 1, Math.floor(output.length / 2), output.length - 1]) {
    await seek((index + 0.5) / fps);
    // «seeked» can come before a hardware decoder hands the frame over: without this the first read may be black.
    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });
    context.drawImage(video, 0, 0, size.w, size.h);
    const { data } = context.getImageData(0, 0, size.w, size.h);
    firstFrame ??= await canvas.convertToBlob({ type: 'image/png' });
    const reference = output[index];
    let squared = 0;
    for (let at = 0; at < data.length; at += 4) {
      for (let c = 0; c < 3; c += 1) squared += (data[at + c] - reference[at + c]) ** 2;
    }
    // The border band has to stay white, or the video's box would show on the page.
    let lowestBorder = 255;
    for (let y = 0; y < size.h; y += 1) {
      for (let x = 0; x < size.w; x += 1) {
        const band = x < 6 || y < 6 || x >= size.w - 6 || y >= size.h - 6;
        if (!band) continue;
        const at = (y * size.w + x) * 4;
        lowestBorder = Math.min(lowestBorder, data[at], data[at + 1], data[at + 2]);
      }
    }
    const mse = squared / (size.w * size.h * 3);
    const signed = [0, 0, 0];
    for (let at = 0; at < data.length; at += 4) {
      for (let c = 0; c < 3; c += 1) signed[c] += data[at + c] - reference[at + c];
    }
    report.push({
      index,
      psnr: mse === 0 ? 99 : Math.round(10 * Math.log10((255 * 255) / mse) * 10) / 10,
      lowestBorder,
      meanShift: signed.map((value) => Math.round((value / (size.w * size.h)) * 10) / 10),
    });
  }
  const bytes = new Uint8Array(await firstFrame.arrayBuffer());
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return {
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    report,
    firstFrame: btoa(text),
  };
}
