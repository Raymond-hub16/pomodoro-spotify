'use client';

import { dateKey, statForDay } from '@/lib/timer/stats';
import { useStatsStore } from '@/stores/statsStore';
import { useTimerStore } from '@/stores/timerStore';

export function StatsBar() {
  // Derived from the tick clock so "today" rolls over at midnight without a reload.
  const today = useTimerStore((s) => dateKey(s.now || Date.now()));
  const focusCount = useStatsStore((s) => statForDay(s.stats, today).focusCount);
  const focusSeconds = useStatsStore((s) => statForDay(s.stats, today).focusSeconds);
  const minutes = Math.round(focusSeconds / 60);

  return (
    <p className="text-sm text-muted" data-testid="stats-today">
      <span className="sr-only">Today: </span>
      <span className="tabular font-semibold text-ink">{focusCount}</span> {focusCount === 1 ? 'session' : 'sessions'},{' '}
      <span className="tabular font-semibold text-ink">{minutes}</span> min today
    </p>
  );
}
