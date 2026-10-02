import { useSettingsStore } from './settingsStore';
import { useSpotifyStore } from './spotifyStore';
import { useStatsStore } from './statsStore';
import { useTimerStore } from './timerStore';

let hydrating: Promise<void> | null = null;

/**
 * Reads every persisted store once, on the client, after the first render.
 * Order matters: settings first (the timer needs durations), then stats (the
 * timer may record a completion), then the timer itself.
 */
export function hydrateStores(): Promise<void> {
  hydrating ??= (async () => {
    await useSettingsStore.persist.rehydrate();
    await useStatsStore.persist.rehydrate();
    await useSpotifyStore.persist.rehydrate();
    await useTimerStore.persist.rehydrate();
    const now = Date.now();
    useStatsStore.getState().prune(now);
    useTimerStore.getState().completeHydration(now);
  })();
  return hydrating;
}
