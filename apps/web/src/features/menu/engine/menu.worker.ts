/// <reference lib="webworker" />
/** The menu engine off the main thread (ТЗ фаза 3 §9): every request goes through `handle`. */
import type { MenuRequest } from '@refectorio/menu-core';
import { handle } from './handler';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<MenuRequest>) => {
  handle(event.data, (response) => {
    self.postMessage(response);
  });
};
