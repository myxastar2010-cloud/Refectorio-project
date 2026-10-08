/**
 * The browser compiles a GPU program for every new combination of effects the first time it draws one — tens of
 * milliseconds each on integrated graphics (traces: `GrShaderCache::store` inside the slow frames), and the first
 * scene change needs about fifteen: its frames used to stall. Programs are kept on disk afterwards, so only the very
 * first visit pays. To make it pay before anyone scrolls, the hidden part 2 is drawn almost transparent through the
 * blurs of its entrance for a few frames right after loading (a «rehearsal», CSS `[data-gpu-warm]`).
 */
const BLUR_STEPS_PX = [0.3, 0.6, 1, 1.4, 1.8, 2.3, 2.8, 3.4, 4, 5, 6, 7, 8];

export function rehearseBlurs(page: HTMLElement) {
  if (page.dataset.scene !== 'hero') return;
  let step = 0;
  const set = () => {
    page.style.setProperty('--warm-blur', `${String(BLUR_STEPS_PX[step] ?? 0)}px`);
  };
  set();
  page.setAttribute('data-gpu-warm', '');
  const tick = () => {
    step += 1;
    // Stops at once if the person has already moved on: the real transition takes over.
    if (step < BLUR_STEPS_PX.length && page.dataset.scene === 'hero') {
      set();
      requestAnimationFrame(tick);
      return;
    }
    page.removeAttribute('data-gpu-warm');
    page.style.removeProperty('--warm-blur');
  };
  requestAnimationFrame(tick);
}
