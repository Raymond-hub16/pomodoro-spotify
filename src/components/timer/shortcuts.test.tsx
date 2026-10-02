// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function setup() {
  vi.resetModules();
  const { useKeyboardShortcuts } = await import('./hooks');
  const { TimerControls } = await import('./TimerControls');
  const { useTimerStore } = await import('@/stores/timerStore');
  const { hydrateStores } = await import('@/stores/hydrate');
  await act(() => hydrateStores());

  function Harness() {
    useKeyboardShortcuts();
    return (
      <>
        <TimerControls />
        <label>
          Note <input aria-label="Note" />
        </label>
      </>
    );
  }
  render(<Harness />);
  return { useTimerStore };
}

describe('keyboard shortcuts', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it('Space toggles, R resets, S skips', async () => {
    const { useTimerStore } = await setup();

    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    expect(useTimerStore.getState().status).toBe('running');
    expect(screen.getByTestId('primary-control').textContent).toContain('Pause');

    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    expect(useTimerStore.getState().status).toBe('paused');

    fireEvent.keyDown(document.body, { key: 'r' });
    expect(useTimerStore.getState().status).toBe('idle');

    fireEvent.keyDown(document.body, { key: 's' });
    expect(useTimerStore.getState().phase).toBe('shortBreak');
  });

  it('is off while typing in an input', async () => {
    const { useTimerStore } = await setup();
    const input = screen.getByLabelText('Note');
    input.focus();

    fireEvent.keyDown(input, { code: 'Space', key: ' ' });
    fireEvent.keyDown(input, { key: 's' });

    expect(useTimerStore.getState().status).toBe('idle');
    expect(useTimerStore.getState().phase).toBe('focus');
  });

  it('ignores modified keys such as Ctrl+R', async () => {
    const { useTimerStore } = await setup();
    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
    fireEvent.keyDown(document.body, { key: 'r', ctrlKey: true });
    expect(useTimerStore.getState().status).toBe('running');
  });
});
