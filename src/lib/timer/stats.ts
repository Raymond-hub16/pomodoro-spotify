import type { DayStat, TimerEvent } from './types';

export const STATS_KEEP_DAYS = 30;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date for an epoch-ms timestamp, as YYYY-MM-DD. */
export function dateKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Adds one entry per completed focus phase. Breaks, skips and resets never count. */
export function recordEvents(stats: DayStat[], events: TimerEvent[]): DayStat[] {
  let next = stats;
  for (const event of events) {
    if (event.type !== 'phaseCompleted' || event.phase !== 'focus') continue;
    const date = dateKey(event.at);
    const seconds = Math.round(event.durationMs / 1000);
    const existing = next.find((s) => s.date === date);
    next = existing
      ? next.map((s) => (s.date === date ? { ...s, focusCount: s.focusCount + 1, focusSeconds: s.focusSeconds + seconds } : s))
      : [...next, { date, focusCount: 1, focusSeconds: seconds }];
  }
  return next;
}

/** Keeps the last `keepDays` calendar days (today included), merged and sorted by date. */
export function pruneStats(stats: DayStat[], now: number, keepDays = STATS_KEEP_DAYS): DayStat[] {
  const oldest = new Date(now);
  oldest.setHours(0, 0, 0, 0);
  oldest.setDate(oldest.getDate() - (keepDays - 1));
  const cutoff = dateKey(oldest.getTime());

  const byDate = new Map<string, DayStat>();
  for (const s of stats) {
    if (s.date < cutoff) continue;
    const prev = byDate.get(s.date);
    byDate.set(
      s.date,
      prev ? { date: s.date, focusCount: prev.focusCount + s.focusCount, focusSeconds: prev.focusSeconds + s.focusSeconds } : s,
    );
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function statForDay(stats: DayStat[], date: string): DayStat {
  return stats.find((s) => s.date === date) ?? { date, focusCount: 0, focusSeconds: 0 };
}
