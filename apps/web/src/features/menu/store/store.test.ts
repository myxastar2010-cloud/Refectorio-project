import type { Plan } from '@refectorio/menu-core';
import { describe, expect, it } from 'vitest';
import { memoryStore } from './db';
import { createMenuStore } from './store';

// Identity is all the store looks at: stand-in plans are enough.
const plan = (name: string) => ({ name }) as unknown as Plan;
let channels = 0;
const fresh = () => {
  const kv = memoryStore();
  channels += 1;
  return createMenuStore(() => Promise.resolve(kv), `test.store.${String(channels)}`);
};

describe('the menu store', () => {
  it('load() resolves to the data as it is now, not as it was at the first load', async () => {
    const store = fresh();
    expect((await store.load()).plan).toBeNull();
    const p1 = plan('p1');
    store.commitPlan(p1);
    expect((await store.load()).plan).toBe(p1);
  });

  it('a wipe leaves nothing for a later load to bring back', async () => {
    const store = fresh();
    await store.load();
    store.commitPlan(plan('p1'));
    await store.wipe();
    const after = await store.load();
    expect(after.plan).toBeNull();
    expect(after.history).toEqual([]);
  });

  it("a worker's answer for an older plan is dropped", async () => {
    const store = fresh();
    await store.load();
    const p1 = plan('p1');
    const p2 = plan('p2');
    store.commitPlan(p1);
    store.commitPlan(p2);
    expect(store.commitPlanIf(p1, plan('late'))).toBeNull();
    expect(store.get().plan).toBe(p2);
    const p3 = plan('p3');
    expect(store.commitPlanIf(p2, p3)?.plan).toBe(p3);
  });

  it('«Отменить» undoes only its own revision', async () => {
    const store = fresh();
    await store.load();
    const p1 = plan('p1');
    const p2 = plan('p2');
    store.commitPlan(p1);
    store.commitPlan(p2);
    // Another change came after p2: the toast of p2 no longer undoes anything.
    store.commitPlan(plan('p3'));
    expect(store.undoPlan(p2)).toBe(false);
    expect(store.undoPlan()).toBe(true);
    expect(store.get().plan).toBe(p2);
    expect(store.undoPlan(p2)).toBe(true);
    expect(store.get().plan).toBe(p1);
  });
});
