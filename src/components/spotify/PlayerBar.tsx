'use client';

import { playerControls } from '@/lib/spotify/player';
import { useSpotifyStore } from '@/stores/spotifyStore';
import { MusicIcon, PauseIcon, PlayIcon, PrevIcon, SkipIcon, VolumeIcon } from '@/components/ui/Icons';

/** Mirrors `player_state_changed`; controls go through SDK methods, not the Web API. */
export function PlayerBar() {
  const nowPlaying = useSpotifyStore((s) => s.nowPlaying);
  const volume = useSpotifyStore((s) => s.volume);
  const selectedName = useSpotifyStore((s) => s.selected?.playlistName ?? null);

  const iconButton = 'flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-ink/8 disabled:opacity-40';

  return (
    <div className="rounded-2xl border border-line bg-bg p-3" data-testid="player-bar">
      <div className="flex items-center gap-3">
        {nowPlaying?.albumArt ? (
          <img src={nowPlaying.albumArt} alt="" width={52} height={52} className="h-13 w-13 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-lg bg-ink/8 text-muted">
            <MusicIcon />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {nowPlaying ? (
            <>
              <p className="truncate font-medium">{nowPlaying.trackName}</p>
              <p className="truncate text-sm text-muted">{nowPlaying.artists}</p>
            </>
          ) : (
            <p className="text-sm text-muted">
              {selectedName ? `Pick “${selectedName}” below to start it here.` : 'Pick a playlist below to start it here.'}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1">
        <button type="button" className={iconButton} onClick={playerControls.previous} disabled={!nowPlaying} aria-label="Previous track">
          <PrevIcon size={18} />
        </button>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-bg hover:opacity-90 disabled:opacity-40"
          onClick={playerControls.toggle}
          disabled={!nowPlaying}
          aria-label={nowPlaying && !nowPlaying.paused ? 'Pause music' : 'Play music'}
        >
          {nowPlaying && !nowPlaying.paused ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <button type="button" className={iconButton} onClick={playerControls.next} disabled={!nowPlaying} aria-label="Next track">
          <SkipIcon size={18} />
        </button>
        <label className="ml-auto flex items-center gap-2 text-muted">
          <VolumeIcon size={18} />
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(e) => playerControls.setVolume(Number(e.target.value) / 100)}
            className="w-24 accent-[var(--accent)]"
          />
        </label>
      </div>
    </div>
  );
}
