'use client';

/**
 * Sound and browser notifications for phase transitions. Both need a user
 * gesture first: `unlockAudio()` and `requestNotificationPermission()` are
 * only ever called from click handlers, never on mount.
 */

let audioContext: AudioContext | null = null;

export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext ??= new Ctor();
    if (audioContext.state === 'suspended') void audioContext.resume();
  } catch {
    audioContext = null;
  }
}

/** A short two-note chime. Rising for "back to focus", falling for "take a break". */
export function playChime(direction: 'up' | 'down'): void {
  const ctx = audioContext;
  if (!ctx || ctx.state !== 'running') return;
  const notes = direction === 'up' ? [659.25, 987.77] : [987.77, 659.25];
  const t0 = ctx.currentTime + 0.02;
  notes.forEach((freq, i) => {
    const start = t0 + i * 0.22;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 1);
  });
}

export type NotificationState = NotificationPermission | 'unsupported';

export function notificationState(): NotificationState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationState> {
  const state = notificationState();
  if (state !== 'default') return state;
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationState();
  }
}

export function showNotification(title: string, body: string): void {
  if (notificationState() !== 'granted') return;
  try {
    // `tag` replaces the previous notification instead of stacking them.
    new Notification(title, { body, tag: 'pomodoro-phase' });
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}
