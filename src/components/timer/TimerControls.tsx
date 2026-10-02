'use client';

import { requestNotificationPermission, unlockAudio } from '@/lib/alerts';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTimerStore } from '@/stores/timerStore';
import { Button } from '@/components/ui/Button';
import { PauseIcon, PlayIcon, ResetIcon, SkipIcon } from '@/components/ui/Icons';

const PRIMARY_LABEL = { idle: 'Start', running: 'Pause', paused: 'Resume' } as const;

export function TimerControls() {
  const status = useTimerStore((s) => s.status);
  const toggle = useTimerStore((s) => s.toggle);
  const reset = useTimerStore((s) => s.reset);
  const skip = useTimerStore((s) => s.skip);

  const onPrimary = () => {
    // A click is the user gesture browsers require for audio and notification prompts.
    unlockAudio();
    if (status === 'idle' && useSettingsStore.getState().notificationsEnabled) void requestNotificationPermission();
    toggle();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-5">
        <Button variant="ghost" className="h-12 w-12" onClick={reset} aria-label="Reset" title="Reset (R)">
          <ResetIcon />
        </Button>
        <Button
          variant="primary"
          className="h-16 min-w-40 px-8 text-lg"
          onClick={onPrimary}
          aria-keyshortcuts="Space"
          data-testid="primary-control"
        >
          {status === 'running' ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          {PRIMARY_LABEL[status]}
        </Button>
        <Button variant="ghost" className="h-12 w-12" onClick={skip} aria-label="Skip to next phase" title="Skip (S)">
          <SkipIcon />
        </Button>
      </div>
      <p className="hidden text-xs text-muted sm:block">
        <kbd className="font-sans">Space</kbd> start or pause, <kbd className="font-sans">R</kbd> reset,{' '}
        <kbd className="font-sans">S</kbd> skip
      </p>
    </div>
  );
}
