import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/storage/keys';
import { DayStatsSchema } from '@/lib/storage/schemas';
import { createValidatedStorage } from '@/lib/storage/validatedStorage';
import { pruneStats, recordEvents } from '@/lib/timer/stats';
import type { DayStat, TimerEvent } from '@/lib/timer/types';

interface StatsState {
  stats: DayStat[];
  record: (events: readonly TimerEvent[]) => void;
  prune: (now: number) => void;
}

/**
 * Daily focus stats. Kept apart from the timer store because it persists under
 * its own key (`pomodoro:stats:v1`) and changes only when a focus completes.
 */
export const useStatsStore = create<StatsState>()(
  persist(
    (set, get) => ({
      stats: [],
      record: (events) => {
        const next = recordEvents(get().stats, [...events]);
        if (next !== get().stats) set({ stats: next });
      },
      prune: (now) => set({ stats: pruneStats(get().stats, now) }),
    }),
    {
      name: STORAGE_KEYS.stats,
      storage: createValidatedStorage(DayStatsSchema),
      partialize: (s) => s.stats,
      merge: (persisted, current) => ({ ...current, stats: (persisted as DayStat[] | undefined) ?? current.stats }),
      skipHydration: true,
    },
  ),
);
