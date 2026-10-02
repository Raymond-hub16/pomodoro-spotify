'use client';

import { useEffect, useRef } from 'react';
import useSWRInfinite from 'swr/infinite';
import { ClientApiError, isSessionError, spotifyApi } from '@/lib/spotify/api';
import type { Playlist, PlaylistsResponse } from '@/lib/spotify/contract';
import { playPlaylist } from '@/lib/spotify/player';
import { useSpotifyStore } from '@/stores/spotifyStore';
import { Button } from '@/components/ui/Button';
import { ExternalIcon, MusicIcon } from '@/components/ui/Icons';
import { Skeleton } from '@/components/ui/Skeleton';

type Key = readonly ['spotify-playlists', number];

const getKey = (_index: number, previous: PlaylistsResponse | null): Key | null => {
  if (previous && previous.nextOffset === null) return null;
  return ['spotify-playlists', previous?.nextOffset ?? 0];
};

interface Props {
  /** `play`: start in this tab (Premium). `open`: hand off to the Spotify app (fallback). */
  mode: 'play' | 'open';
}

export function PlaylistPicker({ mode }: Props) {
  // Fetched once, then cached: no refetch on focus/reconnect, to stay far from rate limits.
  const { data, error, size, setSize, isValidating, isLoading, mutate } = useSWRInfinite(
    getKey,
    ([, offset]: Key) => spotifyApi.playlists(offset),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateFirstPage: false,
      shouldRetryOnError: false,
    },
  );
  const selectedId = useSpotifyStore((s) => s.selected?.playlistId ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const items = data?.flatMap((page) => page.items) ?? [];
  const hasMore = data ? data.at(-1)?.nextOffset !== null : false;
  const loadingMore = isValidating && size > (data?.length ?? 0);

  useEffect(() => {
    if (isSessionError(error)) useSpotifyStore.getState().setLoggedOut();
  }, [error]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loadingMore) void setSize((s) => s + 1);
      },
      { root, rootMargin: '120px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, setSize]);

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading playlists">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3 rounded-md" />
              <Skeleton className="h-3 w-1/3 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    const rateLimited = error instanceof ClientApiError && error.code === 'RATE_LIMITED';
    return (
      <div className="rounded-xl border border-line p-4 text-sm">
        <p>
          {rateLimited
            ? `Spotify is rate limiting requests. Try again in ${error.retryAfter ?? 'a few'} seconds.`
            : 'Couldn’t load your playlists.'}
        </p>
        <Button className="mt-3 h-9 px-4 text-sm" onClick={() => void mutate()}>
          Try again
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No playlists in this account yet. Create one in Spotify, then reload this page.</p>;
  }

  return (
    <div>
      <div ref={scrollRef} className="-mx-2 max-h-80 overflow-y-auto px-2" data-testid="playlist-list">
        <ul className="space-y-1">
          {items.map((p) => (
            <li key={p.id}>
              <PlaylistRow playlist={p} mode={mode} selected={p.id === selectedId} />
            </li>
          ))}
        </ul>
        <div ref={sentinelRef} aria-hidden="true" className="h-px" />
        {loadingMore && <p className="py-2 text-center text-xs text-muted">Loading more…</p>}
      </div>
      {hasMore && !loadingMore && (
        <Button variant="ghost" className="mt-2 h-9 w-full text-sm" onClick={() => void setSize(size + 1)}>
          Load more playlists
        </Button>
      )}
    </div>
  );
}

function Cover({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink/8 text-muted">
      <MusicIcon size={18} />
    </span>
  );
}

function meta(p: Playlist): string {
  const parts = [p.owner, p.trackCount === null ? null : `${p.trackCount} ${p.trackCount === 1 ? 'track' : 'tracks'}`];
  return parts.filter(Boolean).join(', ');
}

function PlaylistRow({ playlist: p, mode, selected }: { playlist: Playlist; mode: Props['mode']; selected: boolean }) {
  const ref = { playlistId: p.id, playlistName: p.name };
  const rowClass = `flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors ${
    selected ? 'bg-accent/12 ring-1 ring-accent/50' : 'hover:bg-ink/5'
  }`;

  if (mode === 'play') {
    return (
      <button type="button" className={rowClass} onClick={() => void playPlaylist(ref)} aria-current={selected ? 'true' : undefined}>
        <Cover url={p.imageUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.name}</span>
          <span className="block truncate text-xs text-muted">{meta(p)}</span>
        </span>
      </button>
    );
  }

  return (
    <div className={rowClass}>
      <Cover url={p.imageUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{p.name}</span>
        <span className="block truncate text-xs text-muted">{meta(p)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <a
          href={p.uri}
          onClick={() => useSpotifyStore.getState().select(ref)}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-muted"
          aria-label={`Open ${p.name} in the Spotify app`}
        >
          Open app
        </a>
        <a
          href={p.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => useSpotifyStore.getState().select(ref)}
          className="rounded-full p-2 text-muted hover:text-ink"
          aria-label={`Open ${p.name} in Spotify on the web (new tab)`}
          title="Open in the web player"
        >
          <ExternalIcon size={16} />
        </a>
      </span>
    </div>
  );
}
