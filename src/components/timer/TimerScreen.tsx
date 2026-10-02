'use client';

import { useEffect, useState } from 'react';
import { useTimerTick } from '@/lib/timer/useTimerTick';
import { hydrateStores } from '@/stores/hydrate';
import { useTimerStore } from '@/stores/timerStore';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import { SpotifyPanel } from '@/components/spotify/SpotifyPanel';
import { Button } from '@/components/ui/Button';
import { SettingsIcon } from '@/components/ui/Icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocumentTitle, useKeyboardShortcuts, usePhaseAlerts } from './hooks';
import { StatsBar } from './StatsBar';
import { TimerControls } from './TimerControls';
import { PhaseStrip, TimerAnnouncer, TimerFace } from './TimerFace';

/**
 * Page layout. Mounts the single tick interval. It subscribes only to values
 * that change per phase, so the per-second countdown re-renders TimerFace alone,
 * never the Spotify panel.
 */
export function TimerScreen() {
  const hasHydrated = useTimerStore((s) => s.hasHydrated);
  const phase = useTimerStore((s) => s.phase);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void hydrateStores();
  }, []);
  useTimerTick();
  usePhaseAlerts();
  useKeyboardShortcuts();

  if (!hasHydrated) return <ScreenSkeleton />;

  return (
    <div data-phase={phase} className="min-h-dvh bg-bg text-ink">
      <TitleSync />
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h1 className="text-xl font-semibold tracking-tight">Pomodoro</h1>
          <div className="flex items-center gap-4">
            <StatsBar />
            <Button className="h-10 px-4 text-sm" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
              <SettingsIcon size={18} />
              <span>Settings</span>
            </Button>
          </div>
        </header>

        <main className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section
            aria-label="Timer"
            className="flex flex-col items-center gap-8 rounded-3xl border border-line bg-surface px-4 py-8 sm:px-8 sm:py-10"
          >
            <PhaseStrip />
            <TimerFace />
            <TimerControls />
            <TimerAnnouncer />
          </section>
          <SpotifyPanel />
        </main>
      </div>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** Isolated so the per-second title update doesn't re-render the layout. */
function TitleSync() {
  useDocumentTitle();
  return null;
}

function ScreenSkeleton() {
  return (
    <div className="min-h-dvh bg-bg" aria-busy="true" aria-label="Loading timer">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 lg:py-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-full" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex flex-col items-center gap-8 rounded-3xl border border-line bg-surface px-4 py-10">
            <Skeleton className="h-10 w-72 rounded-full" />
            <Skeleton className="aspect-square w-full max-w-[22rem] rounded-full" />
            <Skeleton className="h-16 w-44 rounded-full" />
          </div>
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
