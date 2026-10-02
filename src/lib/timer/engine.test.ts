import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyConfig,
  createInitialState,
  getRemainingMs,
  pause,
  rehydrate,
  reset,
  resume,
  skip,
  start,
  tickTo,
} from './engine';
import { pruneStats, recordEvents, statForDay, dateKey } from './stats';
import type { EngineConfig, TimerEvent, TimerSnapshot } from './types';
import { DEFAULT_SETTINGS } from './types';

const MIN = 60_000;
const config: EngineConfig = {
  durations: { ...DEFAULT_SETTINGS.durations },
  longBreakEvery: 4,
  autoStartBreak: true,
  autoStartFocus: false,
};

/** Drives the engine the way useTimerTick does: one interval, tickTo(Date.now()). */
function runTicker(initial: TimerSnapshot, cfg: EngineConfig, intervalMs = 250) {
  const ctx = { state: initial, events: [] as TimerEvent[] };
  const id = setInterval(() => {
    const result = tickTo(ctx.state, cfg, Date.now());
    ctx.state = result.state;
    ctx.events.push(...result.events);
  }, intervalMs);
  return { ctx, stop: () => clearInterval(id) };
}

const completions = (events: TimerEvent[]) => events.filter((e) => e.type === 'phaseCompleted');

describe('timer engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('completes a 25-minute focus exactly once, not twice', () => {
    const running = start(createInitialState(config), Date.now()).state;
    const { ctx, stop } = runTicker(running, config);

    vi.advanceTimersByTime(25 * MIN);
    // A few extra ticks past the boundary must not complete it again.
    vi.advanceTimersByTime(2_000);
    stop();

    expect(completions(ctx.events)).toHaveLength(1);
    expect(completions(ctx.events)[0]).toMatchObject({ phase: 'focus', durationMs: 25 * MIN });
    expect(ctx.state.phase).toBe('shortBreak');
    expect(ctx.state.status).toBe('running'); // autoStartBreak
    expect(ctx.state.focusDoneInCycle).toBe(1);
  });

  it('does nothing on ticks before endsAt', () => {
    const running = start(createInitialState(config), Date.now()).state;
    const result = tickTo(running, config, Date.now() + 25 * MIN - 1);
    expect(result.state).toBe(running);
    expect(result.events).toEqual([]);
  });

  it('does not lose time while paused', () => {
    let state = start(createInitialState(config), Date.now()).state;
    vi.advanceTimersByTime(5 * MIN);
    state = pause(state, Date.now()).state;
    const remainingAtPause = getRemainingMs(state, Date.now());
    expect(remainingAtPause).toBe(20 * MIN);

    vi.advanceTimersByTime(10 * MIN);
    expect(getRemainingMs(state, Date.now())).toBe(20 * MIN);

    state = resume(state, Date.now()).state;
    expect(state.status).toBe('running');
    expect(getRemainingMs(state, Date.now())).toBe(20 * MIN);
    expect(state.endsAt).toBe(Date.now() + 20 * MIN);
  });

  it('rehydrating 8 hours after endsAt advances one phase, idle, and counts one focus', () => {
    const started = start(createInitialState(config), Date.now() - 8 * 60 * MIN - 25 * MIN).state;
    expect(started.endsAt).toBe(Date.now() - 8 * 60 * MIN);

    const result = rehydrate(started, { ...config, autoStartBreak: true, autoStartFocus: true }, Date.now());
    expect(result.state.phase).toBe('shortBreak');
    expect(result.state.status).toBe('idle');
    expect(result.state.endsAt).toBeNull();
    expect(completions(result.events)).toHaveLength(1);

    const stats = recordEvents([], result.events);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ focusCount: 1, focusSeconds: 1500 });

    // Rehydrating again is a no-op: no second pomodoro.
    const again = rehydrate(result.state, config, Date.now());
    expect(again.events).toEqual([]);
  });

  it('keeps a still-running session running on rehydrate', () => {
    const started = start(createInitialState(config), Date.now() - 10 * MIN).state;
    const result = rehydrate(started, config, Date.now());
    expect(result.state).toEqual(started);
    expect(getRemainingMs(result.state, Date.now())).toBe(15 * MIN);
  });

  it('goes to a long break after four completed focus sessions and resets the cycle', () => {
    const cfg = { ...config, autoStartBreak: true, autoStartFocus: true };
    const running = start(createInitialState(cfg), Date.now()).state;
    const { ctx, stop } = runTicker(running, cfg);

    // 4 × 25 min focus + 3 × 5 min short break
    vi.advanceTimersByTime(4 * 25 * MIN + 3 * 5 * MIN + 1_000);
    stop();

    const focusDone = completions(ctx.events).filter((e) => e.type === 'phaseCompleted' && e.phase === 'focus');
    expect(focusDone).toHaveLength(4);
    expect(ctx.state.phase).toBe('longBreak');
    expect(ctx.state.focusDoneInCycle).toBe(0);
    expect(ctx.state.durationMs).toBe(15 * MIN);
  });

  it('applies a duration change to the next phase, not the running one', () => {
    let state = start(createInitialState(config), Date.now()).state;
    const changed: EngineConfig = { ...config, durations: { focus: 50 * 60, shortBreak: 10 * 60, longBreak: 900 } };

    state = applyConfig(state, changed);
    expect(state.durationMs).toBe(25 * MIN);
    expect(state.endsAt).toBe(Date.now() + 25 * MIN);

    const { ctx, stop } = runTicker(state, changed);
    vi.advanceTimersByTime(25 * MIN + 250);
    stop();

    expect(completions(ctx.events)).toHaveLength(1);
    expect(ctx.state.phase).toBe('shortBreak');
    expect(ctx.state.durationMs).toBe(10 * MIN);
  });

  it('lets an untouched idle phase pick up a new duration immediately', () => {
    const idle = createInitialState(config);
    const next = applyConfig(idle, { ...config, durations: { ...config.durations, focus: 45 * 60 } });
    expect(next.remainingMs).toBe(45 * MIN);
    expect(next.durationMs).toBe(45 * MIN);
  });

  it('skip moves on without counting stats or the cycle', () => {
    const running = start(createInitialState(config), Date.now()).state;
    const result = skip(running, config, Date.now());
    expect(result.state.phase).toBe('shortBreak');
    expect(result.state.status).toBe('idle');
    expect(result.state.focusDoneInCycle).toBe(0);
    expect(completions(result.events)).toHaveLength(0);
    expect(recordEvents([], result.events)).toEqual([]);
  });

  it('reset restores the full length and counts nothing', () => {
    let state = start(createInitialState(config), Date.now()).state;
    vi.advanceTimersByTime(7 * MIN);
    const result = reset(state, config, Date.now());
    state = result.state;
    expect(state.status).toBe('idle');
    expect(state.remainingMs).toBe(25 * MIN);
    expect(recordEvents([], result.events)).toEqual([]);
  });

  it('does not drift when the interval is throttled to once a minute', () => {
    const t0 = Date.now();
    const running = start(createInitialState(config), t0).state;
    const { ctx, stop } = runTicker(running, config, 60_000);

    vi.advanceTimersByTime(27 * MIN);
    stop();

    // Break is chained from the real end of focus, not from the late tick.
    expect(ctx.state.phase).toBe('shortBreak');
    expect(ctx.state.endsAt).toBe(t0 + 25 * MIN + 5 * MIN);
    expect(getRemainingMs(ctx.state, Date.now())).toBe(3 * MIN);
  });

  it('does not chase phases after a long sleep even with auto-start on', () => {
    const cfg = { ...config, autoStartBreak: true, autoStartFocus: true };
    const running = start(createInitialState(cfg), Date.now()).state;
    // Laptop asleep: the next tick arrives 8 hours later.
    const result = tickTo(running, cfg, Date.now() + 8 * 60 * MIN);
    expect(completions(result.events)).toHaveLength(1);
    expect(result.state.phase).toBe('shortBreak');
    expect(result.state.status).toBe('idle');
    const next = tickTo(result.state, cfg, Date.now() + 8 * 60 * MIN + 1_000);
    expect(next.events).toEqual([]);
  });
});

describe('stats', () => {
  it('keeps only the last 30 days and merges duplicates', () => {
    const now = new Date(2026, 9, 1, 12).getTime();
    const day = (offset: number) => dateKey(new Date(2026, 9, 1 - offset, 12).getTime());
    const pruned = pruneStats(
      [
        { date: day(30), focusCount: 9, focusSeconds: 9 },
        { date: day(29), focusCount: 1, focusSeconds: 60 },
        { date: day(0), focusCount: 1, focusSeconds: 60 },
        { date: day(0), focusCount: 2, focusSeconds: 120 },
      ],
      now,
    );
    expect(pruned.map((s) => s.date)).toEqual([day(29), day(0)]);
    expect(statForDay(pruned, day(0))).toEqual({ date: day(0), focusCount: 3, focusSeconds: 180 });
  });
});
