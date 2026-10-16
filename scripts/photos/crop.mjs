// Pure geometry of the self-hosted photo crops (unit-tested in materialize.test.mjs).

/** Card widths of the self-hosted files (srcset 480w/720w/960w). */
export const WIDTHS = [480, 720, 960];

/** 3:4 crop box around the focal point (shares of the image), always inside the image. */
export function cropBox(width, height, focal) {
  const cropW = Math.min(width, Math.round((height * 3) / 4));
  const cropH = Math.min(height, Math.round((cropW * 4) / 3));
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  return {
    left: clamp(Math.round(focal.x * width - cropW / 2), width - cropW),
    top: clamp(Math.round(focal.y * height - cropH / 2), height - cropH),
    width: cropW,
    height: cropH,
  };
}
