import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as engine from '@/lib/timer/engine';
import { emitTimerEvents } from '@/lib/timer/events';
import { STORAGE_KEYS } from '@/lib/storage/keys';
import { TimerSnapshotSchema } from '@/lib/storage/schemas';
import { createValidatedStorage } from '@/lib/storage/validatedStorage';
import { DEFAULT_SETTINGS, type EngineConfig, type EngineResult, type TimerEvent, type TimerSnapshot } from '@/lib/timer/types';
import { engineConfigOf, useSettingsStore } from './settingsStore';
import { useStatsStore } from './statsStore';

interface TimerState extends TimerSnapshot {
  /** Last tick time. Not persisted; only drives rendering. */
  now: number;
  /** False until every persisted store has been read on the client. */
  hasHydrated: boolean;
  start: () => void;
  toggle: () => void;
  reset: () => void;
  skip: () => void;
  tick: (now: number) => void;
  completeHydration: (now: number) => void;
}

export function snapshotOf(s: TimerSnapshot): TimerSnapshot {
  return {
    phase: s.phase,
    status: s.status,
    endsAt: s.endsAt,
    remainingMs: s.remainingMs,
    durationMs: s.durationMs,
    focusDoneInCycle: s.focusDoneInCycle,
  };
}

const config = (): EngineConfig => engineConfigOf(useSettingsStore.getState());

function publish(events: readonly TimerEvent[]) {
  if (events.length === 0) return;
  useStatsStore.getState().record(events);
  emitTimerEvents(events);
}

type Action = (state: TimerSnapshot, cfg: EngineConfig, now: number) => EngineResult;

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => {
      /** Settles any overdue completion first, then applies the user action. */
      const run = (action: Action) => {
        const now = Date.now();
        const cfg = config();
        const settled = engine.tickTo(snapshotOf(get()), cfg, now);
        const result = action(settled.state, cfg, now);
        set({ ...result.state, now });
        publish([...settled.events, ...result.events]);
      };

      return {
        ...engine.createInitialState(DEFAULT_SETTINGS),
        now: 0,
        hasHydrated: false,
        start: () => run((s, _cfg, now) => engine.start(s, now)),
        toggle: () => run((s, _cfg, now) => engine.toggle(s, now)),
        reset: () => run((s, cfg, now) => engine.reset(s, cfg, now)),
        skip: () => run((s, cfg, now) => engine.skip(s, cfg, now)),
        tick: (now) => {
          const current = snapshotOf(get());
          const result = engine.tickTo(current, config(), now);
          if (result.state === current) {
            set({ now });
            return;
          }
          set({ ...result.state, now });
          publish(result.events);
        },
        completeHydration: (now) => {
          const cfg = config();
          const result = engine.rehydrate(snapshotOf(get()), cfg, now);
          // A phase that ended while the tab was closed still counts, but it is
          // not announced: no sound or notification for something long past.
          useStatsStore.getState().record(result.events);
          set({ ...engine.applyConfig(result.state, cfg), now, hasHydrated: true });
        },
      };
    },
    {
      name: STORAGE_KEYS.timer,
      storage: createValidatedStorage(TimerSnapshotSchema),
      partialize: (s) => snapshotOf(s),
      skipHydration: true,
    },
  ),
);

// Settings changes reach the timer here; the engine decides whether they apply now.
useSettingsStore.subscribe((settings) => {
  const timer = useTimerStore.getState();
  if (!timer.hasHydrated) return;
  const current = snapshotOf(timer);
  const next = engine.applyConfig(current, engineConfigOf(settings));
  if (next !== current) useTimerStore.setState(next);
});
