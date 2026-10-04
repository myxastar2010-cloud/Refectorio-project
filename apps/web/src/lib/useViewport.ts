import { useEffect, useState } from 'react';

export type Viewport = {
  readonly width: number;
  readonly height: number;
  /** One mockup px on this screen (same as --s in tokens.css). */
  readonly s: number;
  /** Team dialog scale (same as --sd): --s on desktops, «fit into 92 %» on tablets. */
  readonly sd: number;
  readonly phone: boolean;
};

const DESKTOP_MIN_WIDTH = 1280;
const PHONE_MAX_WIDTH = 767;

function read(): Viewport {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const s = Math.min(width / 1920, height / 1080);
  // Same condition as the desktop layout in layout.css: wide screen with a hovering pointer.
  const desktop = width >= DESKTOP_MIN_WIDTH && window.matchMedia('(hover: hover)').matches;
  const sd = desktop ? s : Math.min((0.92 * width) / 1401, (0.92 * height) / 844);
  return { width, height, s, sd, phone: width <= PHONE_MAX_WIDTH };
}

/** Viewport metrics for values Motion must animate in pixels (e.g. border radius of the shared element). */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    const onResize = () => {
      setViewport(read());
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return viewport;
}
