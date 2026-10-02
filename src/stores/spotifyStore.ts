import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/storage/keys';
import { PlaylistRefSchema, type PlaylistRef } from '@/lib/storage/schemas';
import { createValidatedStorage } from '@/lib/storage/validatedStorage';

export type AuthStatus = 'unknown' | 'loggedOut' | 'loggedIn' | 'notConfigured';
/** `unknown`: Spotify did not say whether the account is Premium (Development Mode apps no longer get `product`). */
export type PlaybackMode = 'unknown' | 'premium' | 'fallback';
export type PlayerStatus = 'off' | 'connecting' | 'ready' | 'notReady';

export interface Profile {
  displayName: string | null;
  product: string | null;
  imageUrl: string | null;
}

export interface NowPlaying {
  trackName: string;
  artists: string;
  albumArt: string | null;
  paused: boolean;
  contextUri: string | null;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

interface SpotifyState {
  auth: AuthStatus;
  profile: Profile | null;
  mode: PlaybackMode;
  fallbackReason: string | null;
  sdkLoaded: boolean;
  player: PlayerStatus;
  deviceId: string | null;
  nowPlaying: NowPlaying | null;
  volume: number;
  selected: PlaylistRef | null;
  toast: Toast | null;

  setLoggedIn: (profile: Profile) => void;
  setLoggedOut: () => void;
  setNotConfigured: () => void;
  switchToFallback: (reason: string) => void;
  select: (ref: PlaylistRef) => void;
  showToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

const modeFromProduct = (product: string | null): PlaybackMode => {
  if (product === 'premium') return 'premium';
  if (product === null) return 'unknown';
  return 'fallback'; // 'free' / 'open'
};

const playerReset = { player: 'off' as const, deviceId: null, nowPlaying: null };

export const useSpotifyStore = create<SpotifyState>()(
  persist(
    (set) => ({
      auth: 'unknown',
      profile: null,
      mode: 'unknown',
      fallbackReason: null,
      sdkLoaded: false,
      ...playerReset,
      volume: 0.5,
      selected: null,
      toast: null,

      setLoggedIn: (profile) =>
        set({
          auth: 'loggedIn',
          profile,
          mode: modeFromProduct(profile.product),
          fallbackReason: profile.product && profile.product !== 'premium' ? 'free' : null,
        }),
      setLoggedOut: () => set({ auth: 'loggedOut', profile: null, mode: 'unknown', fallbackReason: null, ...playerReset }),
      setNotConfigured: () => set({ auth: 'notConfigured', profile: null, ...playerReset }),
      switchToFallback: (reason) => set({ mode: 'fallback', fallbackReason: reason, ...playerReset }),
      select: (ref) => set({ selected: ref }),
      showToast: (message, tone = 'info') => set({ toast: { id: ++toastId, message, tone } }),
      dismissToast: (id) => set((s) => (s.toast?.id === id ? { toast: null } : s)),
    }),
    {
      name: STORAGE_KEYS.spotify,
      storage: createValidatedStorage(PlaylistRefSchema),
      partialize: (s) => s.selected,
      merge: (persisted, current) => ({ ...current, selected: (persisted as PlaylistRef | null | undefined) ?? null }),
      skipHydration: true,
    },
  ),
);
