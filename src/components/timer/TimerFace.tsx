'use client';

import { selectRemainingMin, selectRemainingSec } from '@/lib/timer/format';
import { PHASE_LABEL } from '@/lib/timer/types';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTimerStore } from '@/stores/timerStore';
import { PhaseIndicator } from './PhaseIndicator';
import { TimerRing } from './TimerRing';

/** Store-connected wrapper so TimerRing stays a pure, props-only component. */
export function TimerFace() {
  const remainingSec = useTimerStore(selectRemainingSec);
  const durationMs = useTimerStore((s) => s.durationMs);
  const phase = useTimerStore((s) => s.phase);
  const status = useTimerStore((s) => s.status);
  return <TimerRing remainingSec={remainingSec} durationMs={durationMs} phase={phase} status={status} />;
}

export function PhaseStrip() {
  const phase = useTimerStore((s) => s.phase);
  const focusDoneInCycle = useTimerStore((s) => s.focusDoneInCycle);
  const longBreakEvery = useSettingsStore((s) => s.longBreakEvery);
  return <PhaseIndicator phase={phase} focusDoneInCycle={focusDoneInCycle} longBreakEvery={longBreakEvery} />;
}

/** Screen-reader announcement once per minute (and on phase/status changes), never every second. */
export function TimerAnnouncer() {
  const minutes = useTimerStore(selectRemainingMin);
  const phase = useTimerStore((s) => s.phase);
  const status = useTimerStore((s) => s.status);
  const unit = minutes === 1 ? 'minute' : 'minutes';
  const text =
    status === 'idle'
      ? `${PHASE_LABEL[phase]} ready, ${minutes} ${unit}.`
      : `${PHASE_LABEL[phase]}${status === 'paused' ? ' paused' : ''}, ${minutes} ${unit} left.`;
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </p>
  );
}
