import { describe, expect, it } from 'vitest';
import {
  fitGirl,
  GIRL_START,
  isFirstFrame,
  nextGirl,
  shouldPlay,
  type GirlEvent,
} from './girlPlayback';

const run = (events: readonly GirlEvent[]) => events.reduce(nextGirl, GIRL_START);

describe('the girl’s playback', () => {
  it('stays on the still until the first frame is presented', () => {
    expect(run(['start']).phase).toBe('starting');
    expect(run(['start', 'presented']).phase).toBe('playing');
  });

  it('keeps the still when play() is rejected', () => {
    expect(run(['start', 'blocked']).phase).toBe('blocked');
  });

  it('retries once on the first gesture', () => {
    expect(run(['start', 'blocked', 'gesture'])).toEqual({ phase: 'starting', retried: true });
    expect(run(['start', 'blocked', 'gesture', 'presented']).phase).toBe('playing');
  });

  it('gives up after the retry fails too, and a second gesture changes nothing', () => {
    const state = run(['start', 'blocked', 'gesture', 'blocked']);
    expect(state.phase).toBe('gaveUp');
    expect(nextGirl(state, 'gesture')).toEqual(state);
    expect(nextGirl(state, 'start')).toEqual(state);
  });

  it('swaps seamlessly on a late arrival, whatever failed before it', () => {
    expect(run(['start', 'blocked', 'presented']).phase).toBe('playing');
    expect(run(['start', 'blocked', 'gesture', 'blocked', 'presented']).phase).toBe('playing');
  });

  it('has no way back from the video', () => {
    const playing = run(['start', 'presented']);
    for (const event of ['start', 'blocked', 'gesture', 'presented'] as const) {
      expect(nextGirl(playing, event)).toEqual(playing);
    }
  });

  it('does not take a gesture for a start, and ignores a block before it started', () => {
    expect(nextGirl(GIRL_START, 'gesture')).toEqual(GIRL_START);
    expect(nextGirl(GIRL_START, 'blocked')).toEqual(GIRL_START);
  });

  it('counts only the loop’s first frames as the start', () => {
    const frame = 1 / 24;
    expect(isFirstFrame(0, frame)).toBe(true);
    expect(isFirstFrame(frame, frame)).toBe(true);
    expect(isFirstFrame(2 * frame, frame)).toBe(false);
  });

  it('fits her frame into the slot, centred', () => {
    const wide = fitGirl({ left: 10, top: 20, width: 500, height: 100 }, 2);
    expect(wide).toEqual({ left: 160, top: 20, width: 200, height: 100 });
    const tall = fitGirl({ left: 0, top: 0, width: 100, height: 500 }, 2);
    expect(tall).toEqual({ left: 0, top: 225, width: 100, height: 50 });
  });

  it('collapses with a hidden slot', () => {
    const none = fitGirl({ left: 0, top: 0, width: 0, height: 0 }, 2);
    expect(none.width).toBe(0);
    expect(none.height).toBe(0);
  });

  it('plays only while it can be seen', () => {
    const seen = { active: true, onScreen: true, pageVisible: true };
    expect(shouldPlay(seen)).toBe(true);
    expect(shouldPlay({ ...seen, active: false })).toBe(false);
    expect(shouldPlay({ ...seen, onScreen: false })).toBe(false);
    expect(shouldPlay({ ...seen, pageVisible: false })).toBe(false);
  });
});
