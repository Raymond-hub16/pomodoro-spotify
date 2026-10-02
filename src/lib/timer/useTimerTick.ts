'use client';

import { useEffect } from 'react';
import { useTimerStore } from '@/stores/timerStore';

/**
 * The only setInterval in the app. Mounted once, in TimerScreen.
 * The interval only triggers renders; the engine recomputes remaining time
 * from `endsAt`, so browser throttling in background tabs causes no drift.
 */
export function useTimerTick(intervalMs = 250): void {
  const hasHydrated = useTimerStore((s) => s.hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    const tick = () => useTimerStore.getState().tick(Date.now());
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };

    tick();
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hasHydrated, intervalMs]);
}
