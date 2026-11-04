import type { ItemView } from '@refectorio/menu-core';
import { useEffect, useState } from 'react';
import { menuClient } from '../engine/client';

export type Catalog = ReadonlyMap<string, ItemView>;

let loaded: Catalog | null = null;
let loading: Promise<Catalog> | null = null;

/** What the page shows about every item, asked once from the worker (it holds the food data, the page does not). */
export function loadCatalog(): Promise<Catalog> {
  loading ??= menuClient()
    .request({ type: 'catalog' })
    .then((answer) => {
      if (answer.type !== 'catalog') throw new Error('catalog: unexpected answer');
      loaded = new Map(answer.items.map((item) => [item.id, item]));
      return loaded;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

/** The catalog, or null while it loads (a failure is retried on the next mount). */
export function useCatalog(): Catalog | null {
  const [catalog, setCatalog] = useState<Catalog | null>(loaded);
  useEffect(() => {
    if (catalog) return undefined;
    let alive = true;
    loadCatalog().then(
      (value) => {
        if (alive) setCatalog(value);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [catalog]);
  return catalog;
}
