/**
 * Where the hero girl stands on the screen (viewport CSS px), handed from HeroGirl to the food field the moment she is
 * placed: the food never reads her box from the layout (no forced layout on a scroll) and never steers by an old one
 * (a resized window moves her within the frame).
 */
export type GirlPlace = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

type Listener = (place: GirlPlace | null) => void;

let current: GirlPlace | null = null;
const listeners = new Set<Listener>();

/** null: she is not on the page (unmounted, or her slot has no room on this layout). */
export function setGirlPlace(place: GirlPlace | null): void {
  current = place;
  listeners.forEach((listener) => {
    listener(place);
  });
}

/** Calls `listener` with her place now and on every change; returns the unsubscribe. */
export function watchGirlPlace(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
