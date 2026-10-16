import type { Ref } from 'react';

/** Passes a node to a ref given as a prop (a callback or an object ref). */
export function assignRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (typeof ref === 'function') ref(node);
  else if (ref) ref.current = node;
}
