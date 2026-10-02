import type { TimerEvent } from './types';

/**
 * Tiny event bus between the timer store and anything that reacts to phase
 * changes (sound, notifications, Spotify auto-pause). The engine stays
 * unaware of its subscribers, and a failing subscriber can never break the timer.
 */
type Listener = (event: TimerEvent) => void;

const listeners = new Set<Listener>();

export function onTimerEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitTimerEvents(events: readonly TimerEvent[]): void {
  for (const event of events) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Timer event listener failed', error);
      }
    }
  }
}
