import { getRemainingMs } from './engine';
import type { TimerSnapshot } from './types';

/** "mm:ss", or "h:mm:ss" from one hour up. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatMinutes(seconds: number): string {
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? `${minutes}` : minutes.toFixed(1).replace(/\.0$/, '');
}

/** Whole seconds left, rounded up so the display reaches 00:00 exactly at the end. */
export const selectRemainingSec = (s: TimerSnapshot & { now: number }) => Math.ceil(getRemainingMs(s, s.now) / 1000);

/** Minutes left (rounded up): what the screen-reader live region announces. */
export const selectRemainingMin = (s: TimerSnapshot & { now: number }) => Math.ceil(getRemainingMs(s, s.now) / 60_000);
