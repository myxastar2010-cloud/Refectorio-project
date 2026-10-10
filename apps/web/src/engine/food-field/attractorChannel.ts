import type { Attractor } from './math';

/**
 * The quiz finale tells the food layer where its core is (ТЗ §12.2) without importing the engine: the layer lives in
 * the landing bundle, the finale in the quiz chunk.
 */
type Listener = (attractor: Attractor | null) => void;
const listeners = new Set<Listener>();
let current: Attractor | null = null;

export function setFoodAttractor(attractor: Attractor | null): void {
  current = attractor;
  for (const listener of listeners) listener(attractor);
}

export function onFoodAttractor(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
