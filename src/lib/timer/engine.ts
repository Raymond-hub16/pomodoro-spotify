/**
 * Pure timer engine. No React, no timers, no Date.now(): every function that
 * depends on time receives `now` (epoch ms) as a parameter, which is what makes
 * it testable with fake timers and immune to background-tab throttling.
 *
 * The source of truth while running is `endsAt`; the remaining time is always
 * recomputed as `endsAt - now`, so a late tick only delays the UI, never the timer.
 */
import type { EngineConfig, EngineResult, Phase, TimerEvent, TimerSnapshot, TransitionReason } from './types';

const unchanged = (state: TimerSnapshot): EngineResult => ({ state, events: [] });

export function durationMsFor(phase: Phase, config: EngineConfig): number {
  return Math.round(config.durations[phase] * 1000);
}

export function createInitialState(config: EngineConfig): TimerSnapshot {
  const durationMs = durationMsFor('focus', config);
  return { phase: 'focus', status: 'idle', endsAt: null, remainingMs: durationMs, durationMs, focusDoneInCycle: 0 };
}

export function getRemainingMs(state: TimerSnapshot, now: number): number {
  if (state.status === 'running' && state.endsAt !== null) return Math.max(0, state.endsAt - now);
  return state.remainingMs;
}

/** Repairs a snapshot that is structurally valid but internally inconsistent (e.g. hand-edited storage). */
export function normalize(state: TimerSnapshot): TimerSnapshot {
  const durationMs = Math.max(1000, state.durationMs);
  const remainingMs = Math.min(Math.max(0, state.remainingMs), durationMs);
  const focusDoneInCycle = Math.max(0, Math.floor(state.focusDoneInCycle));
  if (state.status === 'running' && state.endsAt === null) {
    return { ...state, status: 'paused', durationMs, remainingMs, focusDoneInCycle };
  }
  if (state.status !== 'running' && state.endsAt !== null) {
    return { ...state, endsAt: null, durationMs, remainingMs, focusDoneInCycle };
  }
  if (
    durationMs === state.durationMs &&
    remainingMs === state.remainingMs &&
    focusDoneInCycle === state.focusDoneInCycle
  ) {
    return state;
  }
  return { ...state, durationMs, remainingMs, focusDoneInCycle };
}

export function start(state: TimerSnapshot, now: number): EngineResult {
  if (state.status !== 'idle') return unchanged(state);
  return {
    state: { ...state, status: 'running', endsAt: now + state.remainingMs },
    events: [{ type: 'started', phase: state.phase, at: now }],
  };
}

export function pause(state: TimerSnapshot, now: number): EngineResult {
  if (state.status !== 'running' || state.endsAt === null) return unchanged(state);
  return {
    state: { ...state, status: 'paused', endsAt: null, remainingMs: Math.max(0, state.endsAt - now) },
    events: [{ type: 'paused', phase: state.phase, at: now }],
  };
}

export function resume(state: TimerSnapshot, now: number): EngineResult {
  if (state.status !== 'paused') return unchanged(state);
  return {
    state: { ...state, status: 'running', endsAt: now + state.remainingMs },
    events: [{ type: 'resumed', phase: state.phase, at: now }],
  };
}

export function toggle(state: TimerSnapshot, now: number): EngineResult {
  if (state.status === 'idle') return start(state, now);
  if (state.status === 'running') return pause(state, now);
  return resume(state, now);
}

/** Puts the current phase back to its full (current-settings) length. Never touches stats. */
export function reset(state: TimerSnapshot, config: EngineConfig, now: number): EngineResult {
  const durationMs = durationMsFor(state.phase, config);
  return {
    state: { ...state, status: 'idle', endsAt: null, remainingMs: durationMs, durationMs },
    events: [{ type: 'reset', phase: state.phase, at: now }],
  };
}

interface NextPhase {
  phase: Phase;
  focusDoneInCycle: number;
}

function nextAfterCompletion(state: TimerSnapshot, config: EngineConfig): NextPhase {
  if (state.phase === 'focus') {
    const done = state.focusDoneInCycle + 1;
    return done >= config.longBreakEvery
      ? { phase: 'longBreak', focusDoneInCycle: 0 }
      : { phase: 'shortBreak', focusDoneInCycle: done };
  }
  if (state.phase === 'longBreak') return { phase: 'focus', focusDoneInCycle: 0 };
  return { phase: 'focus', focusDoneInCycle: state.focusDoneInCycle };
}

function nextAfterSkip(state: TimerSnapshot): NextPhase {
  // A skipped focus is not a completed focus, so the cycle counter stays put.
  if (state.phase === 'focus') return { phase: 'shortBreak', focusDoneInCycle: state.focusDoneInCycle };
  if (state.phase === 'longBreak') return { phase: 'focus', focusDoneInCycle: 0 };
  return { phase: 'focus', focusDoneInCycle: state.focusDoneInCycle };
}

function enterPhase(
  state: TimerSnapshot,
  next: NextPhase,
  config: EngineConfig,
  now: number,
  reason: TransitionReason,
  allowAutoStart: boolean,
): EngineResult {
  const durationMs = durationMsFor(next.phase, config);
  const wantsAutoStart = next.phase === 'focus' ? config.autoStartFocus : config.autoStartBreak;
  // Chain the next phase from the moment the previous one really ended, so a
  // late (throttled) tick causes no drift. If the gap is so long that the next
  // phase would already be over (laptop asleep), stop instead of chasing phases.
  const chainFrom = state.endsAt ?? now;
  const nextWouldBeOver = now - chainFrom >= durationMs;
  const autoStarted = allowAutoStart && wantsAutoStart && !nextWouldBeOver;

  const nextState: TimerSnapshot = {
    phase: next.phase,
    status: autoStarted ? 'running' : 'idle',
    endsAt: autoStarted ? chainFrom + durationMs : null,
    remainingMs: durationMs,
    durationMs,
    focusDoneInCycle: next.focusDoneInCycle,
  };
  const event: TimerEvent = { type: 'phaseChanged', from: state.phase, to: next.phase, reason, autoStarted, at: now };
  return { state: nextState, events: [event] };
}

/** Marks the current phase as finished exactly once and moves to the next one. */
export function completePhase(
  state: TimerSnapshot,
  config: EngineConfig,
  now: number,
  reason: Extract<TransitionReason, 'complete' | 'rehydrate'> = 'complete',
): EngineResult {
  const completed: TimerEvent = {
    type: 'phaseCompleted',
    phase: state.phase,
    durationMs: state.durationMs,
    at: state.endsAt ?? now,
  };
  const entered = enterPhase(state, nextAfterCompletion(state, config), config, now, reason, reason === 'complete');
  return { state: entered.state, events: [completed, ...entered.events] };
}

/** Moves to the next phase without counting the current one. */
export function skip(state: TimerSnapshot, config: EngineConfig, now: number): EngineResult {
  return enterPhase(state, nextAfterSkip(state), config, now, 'skip', false);
}

/** Called on every render tick. Does nothing until `now` reaches `endsAt`, then completes the phase once. */
export function tickTo(state: TimerSnapshot, config: EngineConfig, now: number): EngineResult {
  if (state.status !== 'running' || state.endsAt === null || now < state.endsAt) return unchanged(state);
  return completePhase(state, config, now, 'complete');
}

/**
 * Applied once when the page opens. A session that ended while the tab was
 * closed counts once, and the timer waits (idle) in the next phase: closing
 * the tab overnight never yields a pile of free pomodoros.
 */
export function rehydrate(snapshot: TimerSnapshot, config: EngineConfig, now: number): EngineResult {
  const state = normalize(snapshot);
  if (state.status === 'running' && state.endsAt !== null && now >= state.endsAt) {
    return completePhase(state, config, now, 'rehydrate');
  }
  return unchanged(state);
}

/**
 * Settings changed. A running or paused session keeps the length it started
 * with; only an untouched idle phase picks up the new length right away.
 */
export function applyConfig(state: TimerSnapshot, config: EngineConfig): TimerSnapshot {
  if (state.status !== 'idle' || state.remainingMs !== state.durationMs) return state;
  const durationMs = durationMsFor(state.phase, config);
  if (durationMs === state.durationMs) return state;
  return { ...state, remainingMs: durationMs, durationMs };
}
