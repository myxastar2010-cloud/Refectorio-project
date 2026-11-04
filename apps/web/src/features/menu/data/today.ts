import { useEffect, useState } from 'react';
import { readTestParams } from '../../../lib/params';
import { localIsoDate } from '../engine/client';

/** `?menu=demo` lives on a fixed date: the mockup's week (Wednesday 22 July 2026 → Mon 20 – Sun 26). */
export const DEMO_TODAY = '2026-07-22';

const demo = () => readTestParams(window.location.search).menuDemo;

export function todayIso(): string {
  return demo() ? DEMO_TODAY : localIsoDate();
}

/** Today in the person's time zone; turns over at midnight while the page is open. */
export function useToday(): string {
  const [today, setToday] = useState(todayIso);
  useEffect(() => {
    if (demo()) return undefined;
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = window.setTimeout(() => {
      setToday(todayIso());
    }, midnight.getTime() - now.getTime());
    return () => {
      window.clearTimeout(timer);
    };
  }, [today]);
  return today;
}
