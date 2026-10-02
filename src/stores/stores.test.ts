// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/lib/storage/keys';
import { DEFAULT_SETTINGS } from '@/lib/timer/types';

// Fresh module graph per test: stores are singletons and hydrate only once.
async function loadStores() {
  vi.resetModules();
  const [{ useSettingsStore }, { useTimerStore }, { useStatsStore }, { hydrateStores }] = await Promise.all([
    import('./settingsStore'),
    import('./timerStore'),
    import('./statsStore'),
    import('./hydrate'),
  ]);
  return { useSettingsStore, useTimerStore, useStatsStore, hydrateStores };
}

describe('persisted stores', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it.each([
    ['invalid JSON', '{"durations": '],
    ['wrong shape', JSON.stringify({ durations: 'long', longBreakEvery: -1 })],
    ['wrong types', JSON.stringify({ ...DEFAULT_SETTINGS, soundEnabled: 'yes' })],
  ])('falls back to default settings on %s without throwing', async (_label, raw) => {
    localStorage.setItem(STORAGE_KEYS.settings, raw);
    const { useSettingsStore, hydrateStores } = await loadStores();

    await expect(hydrateStores()).resolves.toBeUndefined();

    const s = useSettingsStore.getState();
    expect(s.durations).toEqual(DEFAULT_SETTINGS.durations);
    expect(s.longBreakEvery).toBe(4);
    expect(s.soundEnabled).toBe(true);
  });

  it('stores exactly the documented shape under each key', async () => {
    const { useSettingsStore, useTimerStore, hydrateStores } = await loadStores();
    await hydrateStores();

    useSettingsStore.getState().setPartial({ longBreakEvery: 3 });
    useTimerStore.getState().start();

    const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) ?? 'null');
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, longBreakEvery: 3 });

    const timer = JSON.parse(localStorage.getItem(STORAGE_KEYS.timer) ?? 'null');
    expect(timer).toMatchObject({ phase: 'focus', status: 'running', focusDoneInCycle: 0 });
    expect(Object.keys(timer).sort()).toEqual(
      ['durationMs', 'endsAt', 'focusDoneInCycle', 'phase', 'remainingMs', 'status'].sort(),
    );
  });

  it('does not write the timer key on plain ticks', async () => {
    const { useTimerStore, hydrateStores } = await loadStores();
    await hydrateStores();
    useTimerStore.getState().start();

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const now = Date.now();
    for (let i = 1; i <= 20; i++) useTimerStore.getState().tick(now + i * 250);

    expect(setItem.mock.calls.filter(([key]) => key === STORAGE_KEYS.timer)).toHaveLength(0);
  });

  it('resumes a running session after reload from the right position', async () => {
    const endsAt = Date.now() + 12 * 60_000;
    localStorage.setItem(
      STORAGE_KEYS.timer,
      JSON.stringify({ phase: 'focus', status: 'running', endsAt, remainingMs: 1_500_000, durationMs: 1_500_000, focusDoneInCycle: 2 }),
    );
    const { useTimerStore, hydrateStores } = await loadStores();
    await hydrateStores();

    const t = useTimerStore.getState();
    expect(t.status).toBe('running');
    expect(t.endsAt).toBe(endsAt);
    expect(t.focusDoneInCycle).toBe(2);
  });

  it('counts a session that ended while closed once, then waits idle', async () => {
    const endsAt = Date.now() - 8 * 60 * 60_000;
    localStorage.setItem(
      STORAGE_KEYS.timer,
      JSON.stringify({ phase: 'focus', status: 'running', endsAt, remainingMs: 1_500_000, durationMs: 1_500_000, focusDoneInCycle: 0 }),
    );
    const { useTimerStore, useStatsStore, hydrateStores } = await loadStores();
    await hydrateStores();

    expect(useTimerStore.getState()).toMatchObject({ phase: 'shortBreak', status: 'idle' });
    const total = useStatsStore.getState().stats.reduce((n, s) => n + s.focusCount, 0);
    expect(total).toBe(1);
  });
});
