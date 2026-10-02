'use client';

import { useEffect } from 'react';
import { playChime, showNotification, unlockAudio } from '@/lib/alerts';
import { onTimerEvent } from '@/lib/timer/events';
import { formatClock, formatMinutes, selectRemainingSec } from '@/lib/timer/format';
import { PHASE_LABEL } from '@/lib/timer/types';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTimerStore } from '@/stores/timerStore';

/** Sound + browser notification when a phase ends on its own. Skips and resets stay silent. */
export function usePhaseAlerts(): void {
  useEffect(
    () =>
      onTimerEvent((event) => {
        if (event.type !== 'phaseChanged' || event.reason !== 'complete') return;
        const settings = useSettingsStore.getState();
        const toBreak = event.to !== 'focus';
        if (settings.soundEnabled) playChime(toBreak ? 'down' : 'up');
        if (!settings.notificationsEnabled) return;

        const minutes = formatMinutes(settings.durations[event.to]);
        if (event.to === 'shortBreak') {
          showNotification('Focus session done', `Take a ${minutes}-minute break.`);
        } else if (event.to === 'longBreak') {
          showNotification('Cycle complete', `Take a ${minutes}-minute long break.`);
        } else {
          showNotification('Break is over', event.autoStarted ? 'Focus has started.' : 'Start the next focus session when ready.');
        }
      }),
    [],
  );
}

/** Keeps the remaining time readable from other tabs. */
export function useDocumentTitle(): void {
  const hasHydrated = useTimerStore((s) => s.hasHydrated);
  const seconds = useTimerStore(selectRemainingSec);
  const phase = useTimerStore((s) => s.phase);
  const status = useTimerStore((s) => s.status);

  useEffect(() => {
    if (!hasHydrated) return;
    const paused = status === 'paused' ? ' (paused)' : '';
    document.title = `${formatClock(seconds)} ${PHASE_LABEL[phase]}${paused} | Pomodoro`;
  }, [hasHydrated, seconds, phase, status]);
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a[href], [role="button"], summary') !== null;
}

/** Space: start/pause, R: reset, S: skip. Off while typing or while a dialog is open. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target) || document.querySelector('dialog[open]')) return;
      const timer = useTimerStore.getState();
      if (!timer.hasHydrated) return;

      if (e.code === 'Space') {
        // A focused button already reacts to Space natively; don't fire twice.
        if (isActivatable(e.target)) return;
        e.preventDefault();
        unlockAudio();
        timer.toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        timer.reset();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        timer.skip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
