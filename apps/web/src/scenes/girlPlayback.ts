/**
 * The hero girl's playback as a pure state machine (stage 4, §1.5). What is on screen changes only once: from the still
 * to the video, when the video's first frame is presented. Everything that goes wrong leaves the still there.
 */
export type GirlPhase = 'idle' | 'starting' | 'playing' | 'blocked' | 'gaveUp';

export type GirlState = {
  readonly phase: GirlPhase;
  /** The one retry on the first gesture has been used. */
  readonly retried: boolean;
};

export type GirlEvent =
  /** play() is about to be called. */
  | 'start'
  /** The first frame of the loop has been presented. */
  | 'presented'
  /** play() rejected (Low Power Mode, autoplay policy), a media error or a stall. */
  | 'blocked'
  /** The first user gesture of the page. */
  | 'gesture';

export const GIRL_START: GirlState = { phase: 'idle', retried: false };

export function nextGirl(state: GirlState, event: GirlEvent): GirlState {
  if (state.phase === 'playing') return state;
  switch (event) {
    case 'start':
      return state.phase === 'idle' ? { ...state, phase: 'starting' } : state;
    // A late arrival swaps as seamlessly as an early one, whatever failed before it.
    case 'presented':
      return { ...state, phase: 'playing' };
    case 'blocked':
      if (state.phase !== 'starting') return state;
      return { ...state, phase: state.retried ? 'gaveUp' : 'blocked' };
    case 'gesture':
      return state.phase === 'blocked' && !state.retried
        ? { phase: 'starting', retried: true }
        : state;
  }
}

/** A frame near the start of the loop: the still is that frame, so the swap is invisible only from here. */
export const isFirstFrame = (mediaTimeS: number, frameS: number): boolean =>
  mediaTimeS < frameS * 1.5;

/** Her frame inside her slot, centred: the slot of a small screen is as large as the free space, not her shape. */
export function fitGirl(
  slot: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  },
  aspect: number,
) {
  const width = Math.min(slot.width, slot.height * aspect);
  const height = width / aspect;
  return {
    left: slot.left + (slot.width - width) / 2,
    top: slot.top + (slot.height - height) / 2,
    width,
    height,
  };
}

/** The smallest step in CSS px that is whole in device px too: 1 at 100 % and 200 %, 2 at 150 %, 4 at 125 %. */
export function pixelGrid(deviceRatio: number): number {
  for (let step = 1; step < 8; step += 1) {
    const device = step * deviceRatio;
    if (Math.abs(device - Math.round(device)) < 0.01) return step;
  }
  return 1;
}

/** The video plays only while somebody can see it. */
export const shouldPlay = (input: {
  readonly active: boolean;
  readonly onScreen: boolean;
  readonly pageVisible: boolean;
}): boolean => input.active && input.onScreen && input.pageVisible;
