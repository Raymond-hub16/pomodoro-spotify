import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/lib/storage/keys';
import { SettingsSchema } from '@/lib/storage/schemas';
import { createValidatedStorage } from '@/lib/storage/validatedStorage';
import { DEFAULT_SETTINGS, type EngineConfig, type Settings } from '@/lib/timer/types';

interface SettingsState extends Settings {
  save: (settings: Settings) => void;
  setPartial: (partial: Partial<Settings>) => void;
}

export function pickSettings(s: Settings): Settings {
  return {
    durations: { ...s.durations },
    longBreakEvery: s.longBreakEvery,
    autoStartBreak: s.autoStartBreak,
    autoStartFocus: s.autoStartFocus,
    soundEnabled: s.soundEnabled,
    notificationsEnabled: s.notificationsEnabled,
    pauseMusicOnBreak: s.pauseMusicOnBreak,
  };
}

export function engineConfigOf(s: Settings): EngineConfig {
  return {
    durations: s.durations,
    longBreakEvery: s.longBreakEvery,
    autoStartBreak: s.autoStartBreak,
    autoStartFocus: s.autoStartFocus,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      save: (settings) => set(pickSettings(settings)),
      setPartial: (partial) => set(partial),
    }),
    {
      name: STORAGE_KEYS.settings,
      storage: createValidatedStorage(SettingsSchema),
      partialize: (s) => pickSettings(s),
      skipHydration: true,
    },
  ),
);
