import { useReducedMotion } from 'motion/react';
import { useSyncExternalStore } from 'react';

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

function subscribeFinePointer(onChange: () => void) {
  const list = window.matchMedia(FINE_POINTER);
  list.addEventListener('change', onChange);
  return () => {
    list.removeEventListener('change', onChange);
  };
}

const finePointerSnapshot = () => window.matchMedia(FINE_POINTER).matches;
const serverSnapshot = () => false;

/** Mouse-like input: hover effects (wave on hover, tilt) only make sense here. */
export function useFinePointer(): boolean {
  return useSyncExternalStore(subscribeFinePointer, finePointerSnapshot, serverSnapshot);
}

type NetworkInformationLike = { saveData?: boolean };

/** Reduced motion: the OS setting or the browser's data saver (navigator.connection.saveData). */
export function useCalmMotion(): boolean {
  const reduced = useReducedMotion() ?? false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return reduced || connection?.saveData === true;
}
