'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { notificationState, playChime, requestNotificationPermission, unlockAudio, type NotificationState } from '@/lib/alerts';
import { SettingsSchema } from '@/lib/storage/schemas';
import { PHASE_LABEL, type Phase, type Settings } from '@/lib/timer/types';
import { pickSettings, useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/Button';
import { CloseIcon } from '@/components/ui/Icons';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="settings-title"
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-md border-l border-line bg-surface p-0 text-ink shadow-2xl"
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself, outside the panel) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && <SettingsForm onClose={onClose} />}
    </dialog>
  );
}

const DURATION_FIELDS: Phase[] = ['focus', 'shortBreak', 'longBreak'];

type Draft = Omit<Settings, 'durations'> & { minutes: Record<Phase, string>; longBreakEveryText: string };

const toMinutesText = (seconds: number) => String(Math.round((seconds / 60) * 100) / 100);

function SettingsForm({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => {
    const s = pickSettings(useSettingsStore.getState());
    return {
      ...s,
      minutes: {
        focus: toMinutesText(s.durations.focus),
        shortBreak: toMinutesText(s.durations.shortBreak),
        longBreak: toMinutesText(s.durations.longBreak),
      },
      longBreakEveryText: String(s.longBreakEvery),
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationState>('default');

  useEffect(() => setPermission(notificationState()), []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const candidate: Settings = {
      durations: {
        focus: Math.round(Number(draft.minutes.focus) * 60),
        shortBreak: Math.round(Number(draft.minutes.shortBreak) * 60),
        longBreak: Math.round(Number(draft.minutes.longBreak) * 60),
      },
      longBreakEvery: Number(draft.longBreakEveryText),
      autoStartBreak: draft.autoStartBreak,
      autoStartFocus: draft.autoStartFocus,
      soundEnabled: draft.soundEnabled,
      notificationsEnabled: draft.notificationsEnabled,
      pauseMusicOnBreak: draft.pauseMusicOnBreak,
    };
    const parsed = SettingsSchema.safeParse(candidate);
    if (!parsed.success) {
      setError('Lengths must be between 1 second and 240 minutes, and the long break must come after 1 to 12 sessions.');
      return;
    }
    useSettingsStore.getState().save(parsed.data);
    onClose();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <h2 id="settings-title" className="text-lg font-semibold">
          Settings
        </h2>
        <Button variant="ghost" className="h-10 w-10" onClick={onClose} aria-label="Close settings">
          <CloseIcon />
        </Button>
      </header>

      <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
        <fieldset>
          <legend className="mb-1 font-semibold">Lengths</legend>
          <p className="mb-4 text-sm text-muted">A running session keeps its length. Changes apply from the next phase.</p>
          <div className="grid grid-cols-3 gap-3">
            {DURATION_FIELDS.map((phase) => (
              <NumberField
                key={phase}
                label={PHASE_LABEL[phase]}
                suffix="min"
                value={draft.minutes[phase]}
                min={1}
                max={240}
                onChange={(v) => set('minutes', { ...draft.minutes, [phase]: v })}
              />
            ))}
          </div>
          <div className="mt-4 max-w-40">
            <NumberField
              label="Long break after"
              suffix="sessions"
              value={draft.longBreakEveryText}
              min={1}
              max={12}
              onChange={(v) => set('longBreakEveryText', v)}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="mb-2 font-semibold">Flow</legend>
          <Toggle checked={draft.autoStartBreak} onChange={(v) => set('autoStartBreak', v)} label="Start breaks automatically" />
          <Toggle checked={draft.autoStartFocus} onChange={(v) => set('autoStartFocus', v)} label="Start focus automatically after a break" />
          <Toggle
            checked={draft.pauseMusicOnBreak}
            onChange={(v) => set('pauseMusicOnBreak', v)}
            label="Pause music during breaks"
            hint="Only for Spotify Premium playing inside this tab."
          />
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="mb-2 font-semibold">Alerts</legend>
          <Toggle
            checked={draft.soundEnabled}
            onChange={(v) => {
              if (v) unlockAudio();
              set('soundEnabled', v);
            }}
            label="Play a chime when a phase ends"
            action={
              <button
                type="button"
                className="text-sm font-medium text-accent underline-offset-4 hover:underline"
                onClick={() => {
                  unlockAudio();
                  playChime('down');
                }}
              >
                Test
              </button>
            }
          />
          <Toggle
            checked={draft.notificationsEnabled}
            onChange={async (v) => {
              set('notificationsEnabled', v);
              if (v) setPermission(await requestNotificationPermission());
            }}
            label="Show a browser notification"
            hint={
              permission === 'denied'
                ? 'Notifications are blocked for this site. Allow them in your browser’s site settings.'
                : permission === 'unsupported'
                  ? 'This browser does not support notifications.'
                  : undefined
            }
          />
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
            {error}
          </p>
        )}
      </div>

      <footer className="flex justify-end gap-3 border-t border-line px-6 py-4">
        <Button onClick={onClose} className="h-11 px-5">
          Cancel
        </Button>
        <Button type="submit" variant="primary" className="h-11 px-6">
          Save settings
        </Button>
      </footer>
    </form>
  );
}

function NumberField(props: {
  label: string;
  suffix: string;
  value: string;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-muted">
        {props.label}
      </label>
      <div className="flex items-center rounded-xl border border-line bg-bg focus-within:border-accent">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={props.min}
          max={props.max}
          step="any"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className="tabular w-full min-w-0 bg-transparent px-3 py-2.5 text-base font-semibold outline-none"
        />
        <span className="pr-3 text-xs text-muted">{props.suffix}</span>
      </div>
    </div>
  );
}

function Toggle(props: {
  checked: boolean;
  label: string;
  hint?: string;
  action?: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div>
        <label htmlFor={id} className="cursor-pointer">
          {props.label}
        </label>
        {props.hint && (
          <p id={hintId} className="mt-0.5 text-sm text-muted">
            {props.hint}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {props.action}
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={props.checked}
          aria-describedby={props.hint ? hintId : undefined}
          onChange={(e) => props.onChange(e.target.checked)}
          className="relative h-6 w-11 cursor-pointer appearance-none rounded-full bg-ink/20 transition-colors before:absolute before:top-0.5 before:left-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:bg-accent checked:before:translate-x-5"
        />
      </div>
    </div>
  );
}
