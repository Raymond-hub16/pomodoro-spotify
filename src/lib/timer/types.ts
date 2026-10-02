export type Phase = 'focus' | 'shortBreak' | 'longBreak';
export type TimerStatus = 'idle' | 'running' | 'paused';

export const PHASES: readonly Phase[] = ['focus', 'shortBreak', 'longBreak'] as const;

/** All durations are in seconds. */
export interface Settings {
  durations: Record<Phase, number>;
  longBreakEvery: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  pauseMusicOnBreak: boolean;
}

/**
 * Persisted timer state. Absolute times are epoch milliseconds.
 *
 * `durationMs` is not in the original spec table: it records the length the
 * current session was started with, so a settings change never alters a
 * session that is already running, and the ring/stats know the true length.
 */
export interface TimerSnapshot {
  phase: Phase;
  status: TimerStatus;
  endsAt: number | null;
  remainingMs: number;
  durationMs: number;
  focusDoneInCycle: number;
}

export interface DayStat {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  focusCount: number;
  focusSeconds: number;
}

/** The subset of settings the engine needs. The engine never knows about sound, notifications or Spotify. */
export type EngineConfig = Pick<Settings, 'durations' | 'longBreakEvery' | 'autoStartBreak' | 'autoStartFocus'>;

export type TransitionReason = 'complete' | 'skip' | 'rehydrate';

export type TimerEvent =
  | { type: 'phaseCompleted'; phase: Phase; durationMs: number; at: number }
  | { type: 'phaseChanged'; from: Phase; to: Phase; reason: TransitionReason; autoStarted: boolean; at: number }
  | { type: 'started'; phase: Phase; at: number }
  | { type: 'paused'; phase: Phase; at: number }
  | { type: 'resumed'; phase: Phase; at: number }
  | { type: 'reset'; phase: Phase; at: number };

export interface EngineResult {
  state: TimerSnapshot;
  events: TimerEvent[];
}

export const DEFAULT_SETTINGS: Settings = {
  durations: { focus: 1500, shortBreak: 300, longBreak: 900 },
  longBreakEvery: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  soundEnabled: true,
  notificationsEnabled: true,
  pauseMusicOnBreak: true,
};

export const PHASE_LABEL: Record<Phase, string> = {
  focus: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
};
