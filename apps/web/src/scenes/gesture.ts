/**
 * Wheel/touchpad gesture logic (ТЗ 6.5), pure and unit-tested.
 *
 * A "gesture" is a stream of wheel events with gaps shorter than `quietMs` — a touchpad fling with its inertia tail
 * is one gesture. Within a gesture, deltas inside a sliding `windowMs` are summed; reaching `thresholdPx` triggers
 * at most one transition. Events that arrive while a transition is running consume the gesture, so the inertia
 * tail after the transition can never trigger a second one: a new transition needs a pause ≥ `quietMs`.
 * Inertia never changes direction, so a delta of at least `reverseMinPx` against the gesture is a new gesture too.
 */

export type Direction = 'down' | 'up';

export type WheelGestureOptions = {
  readonly thresholdPx: number;
  readonly windowMs: number;
  readonly quietMs: number;
  readonly reverseMinPx: number;
};

const LINE_PX = 16;

/** WheelEvent.deltaY in pixels whatever the deltaMode (0 pixels, 1 lines, 2 pages). */
export function normalizeWheelDelta(
  deltaY: number,
  deltaMode: number,
  pageHeightPx: number,
): number {
  if (deltaMode === 1) return deltaY * LINE_PX;
  if (deltaMode === 2) return deltaY * pageHeightPx;
  return deltaY;
}

export function createWheelGesture({
  thresholdPx,
  windowMs,
  quietMs,
  reverseMinPx,
}: WheelGestureOptions) {
  let lastEventMs = Number.NEGATIVE_INFINITY;
  let consumed = false;
  let recent: { timeMs: number; deltaPx: number }[] = [];
  /** Direction of the current gesture: 1 down, -1 up, 0 not known yet. */
  let sign = 0;

  return {
    /**
     * Feed one wheel event. `locked` — a transition is running right now.
     * Returns the direction when this event completes a gesture that should switch the scene.
     */
    push(deltaPx: number, nowMs: number, locked: boolean): Direction | null {
      const reversed =
        sign !== 0 && Math.sign(deltaPx) === -sign && Math.abs(deltaPx) >= reverseMinPx;
      if (nowMs - lastEventMs > quietMs || reversed) {
        consumed = false;
        recent = [];
        sign = 0;
      }
      lastEventMs = nowMs;
      if (sign === 0) sign = Math.sign(deltaPx);
      if (locked) consumed = true;
      if (consumed || deltaPx === 0) return null;

      recent = recent.filter((event) => nowMs - event.timeMs <= windowMs);
      recent.push({ timeMs: nowMs, deltaPx });
      const sum = recent.reduce((total, event) => total + event.deltaPx, 0);
      if (Math.abs(sum) < thresholdPx) return null;
      consumed = true;
      return sum > 0 ? 'down' : 'up';
    },
    /** A transition started by a key or a button also swallows the ongoing wheel gesture. */
    consume() {
      consumed = true;
    },
  };
}

export type SwipeOptions = { readonly minPx: number; readonly dominance: number };

/** Vertical swipe: |dy| > minPx and |dy| > dominance·|dx|. Finger moving up = go down to the next scene. */
export function swipeDirection(
  dx: number,
  dy: number,
  { minPx, dominance }: SwipeOptions,
): Direction | null {
  if (Math.abs(dy) <= minPx || Math.abs(dy) <= dominance * Math.abs(dx)) return null;
  return dy < 0 ? 'down' : 'up';
}

/** A scroll container's position (part 1 or part 2 when it does not fit the screen). */
export type ScrollBox = {
  readonly scrollTop: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
};

/** Whether the content can still move in this direction; at the edge, the next movement switches scenes. */
export function hasScrollRoom(box: ScrollBox, direction: Direction): boolean {
  if (box.scrollHeight <= box.clientHeight + 1) return false;
  return direction === 'up'
    ? box.scrollTop > 0.5
    : box.scrollTop + box.clientHeight < box.scrollHeight - 1;
}

/** One key press of scrolling inside a scene: arrows a short step, the other keys almost a screen. */
export function keyScrollStepPx(key: string, viewportPx: number): number {
  return key === 'ArrowDown' || key === 'ArrowUp'
    ? Math.max(40, viewportPx * 0.15)
    : viewportPx * 0.85;
}

/** Keys that switch scenes (only when focus is not on an interactive element). */
export function keyDirection(key: string, shiftKey: boolean): Direction | null {
  switch (key) {
    case 'ArrowDown':
    case 'PageDown':
    case 'End':
      return 'down';
    case 'ArrowUp':
    case 'PageUp':
    case 'Home':
      return 'up';
    case ' ':
      return shiftKey ? 'up' : 'down';
    default:
      return null;
  }
}
