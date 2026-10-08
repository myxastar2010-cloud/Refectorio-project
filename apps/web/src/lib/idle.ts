/** Runs `task` when the browser is idle (at the latest after `timeoutMs`); Safari has no requestIdleCallback. */
export function whenIdle(task: () => void, timeoutMs: number): () => void {
  const idle = (window as Partial<Pick<Window, 'requestIdleCallback'>>).requestIdleCallback;
  if (idle) {
    const id = idle.call(window, task, { timeout: timeoutMs });
    return () => {
      window.cancelIdleCallback(id);
    };
  }
  const id = window.setTimeout(task, timeoutMs);
  return () => {
    window.clearTimeout(id);
  };
}
