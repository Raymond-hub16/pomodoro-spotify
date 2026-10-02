'use client';

import { useEffect, useRef } from 'react';
import {
  attachMusicAutoPause,
  connectPlayer,
  consumeAuthErrorParam,
  disconnectPlayer,
  loadSession,
  logout,
} from '@/lib/spotify/player';
import { useSpotifyStore } from '@/stores/spotifyStore';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Toast } from '@/components/ui/Toast';
import { PlayerBar } from './PlayerBar';
import { PlaylistPicker } from './PlaylistPicker';
import { SpotifySdkLoader } from './SpotifySdkLoader';

/** Renders exactly one of: login, fallback picker, or player + picker. */
export function SpotifyPanel() {
  const auth = useSpotifyStore((s) => s.auth);
  const mode = useSpotifyStore((s) => s.mode);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    consumeAuthErrorParam();
    void loadSession();
  }, []);

  useEffect(() => attachMusicAutoPause(), []);
  useEffect(() => () => disconnectPlayer(), []);

  return (
    <section aria-labelledby="music-title" className="rounded-3xl border border-line bg-surface p-5 sm:p-6" data-testid="spotify-panel">
      <header className="mb-4 flex min-h-9 items-center justify-between gap-3">
        <h2 id="music-title" className="text-lg font-semibold">
          Music
        </h2>
        {auth === 'loggedIn' && <Account />}
      </header>
      <div className="space-y-4">
        <Toast />
        <PanelBody />
      </div>
      {auth === 'loggedIn' && mode !== 'fallback' && <SpotifySdkLoader />}
    </section>
  );
}

function PanelBody() {
  const auth = useSpotifyStore((s) => s.auth);
  const mode = useSpotifyStore((s) => s.mode);

  if (auth === 'unknown') {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-4 w-4/5 rounded-md" />
        <Skeleton className="h-11 w-44 rounded-full" />
      </div>
    );
  }

  if (auth === 'notConfigured') {
    return (
      <p className="text-sm text-muted">
        Music is off because Spotify isn’t set up on the server yet. Add your Spotify app’s client ID, client secret and a
        session secret to <code className="rounded bg-ink/8 px-1">.env.local</code>, then restart the app. The timer works
        without it.
      </p>
    );
  }

  if (auth === 'loggedOut') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Play one of your Spotify playlists while you focus. It pauses by itself when a break starts.
        </p>
        <a
          href="/api/auth/login"
          className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-6 font-medium text-bg hover:opacity-90"
        >
          Log in with Spotify
        </a>
      </div>
    );
  }

  if (mode === 'fallback') return <FallbackBody />;
  return <PremiumBody />;
}

function Account() {
  const profile = useSpotifyStore((s) => s.profile);
  return (
    <div className="flex min-w-0 items-center gap-2">
      {profile?.imageUrl && <img src={profile.imageUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />}
      <span className="truncate text-sm text-muted">{profile?.displayName ?? 'Spotify account'}</span>
      <Button variant="ghost" className="h-8 px-3 text-sm" onClick={() => void logout()}>
        Log out
      </Button>
    </div>
  );
}

const FALLBACK_TEXT: Record<string, string> = {
  free: 'Playing inside this tab needs Spotify Premium, so playlists open in your Spotify app instead. The timer runs here as usual.',
  unsupported: 'This browser can’t play Spotify inside a tab. Playlists open in your Spotify app instead.',
  sdk: 'The Spotify player couldn’t load. Playlists open in your Spotify app instead.',
};

function FallbackBody() {
  const reason = useSpotifyStore((s) => s.fallbackReason);
  return (
    <div className="space-y-4" data-testid="spotify-fallback">
      <p className="text-sm text-muted">{FALLBACK_TEXT[reason ?? 'free'] ?? FALLBACK_TEXT.free}</p>
      <PlaylistPicker mode="open" />
    </div>
  );
}

function PremiumBody() {
  const player = useSpotifyStore((s) => s.player);
  const sdkLoaded = useSpotifyStore((s) => s.sdkLoaded);
  const mode = useSpotifyStore((s) => s.mode);

  return (
    <div className="space-y-4">
      {player === 'ready' && <PlayerBar />}

      {player === 'off' && (
        <div className="rounded-2xl border border-line bg-bg p-4">
          <p className="text-sm">Play music in this tab, controlled by the timer.</p>
          <Button variant="primary" className="mt-3 h-10 px-5 text-sm" onClick={connectPlayer} disabled={!sdkLoaded}>
            {sdkLoaded ? 'Connect player' : 'Loading player…'}
          </Button>
          {mode === 'unknown' && (
            <p className="mt-3 text-xs text-muted">Needs Spotify Premium. With a Free account, playlists open in the Spotify app.</p>
          )}
        </div>
      )}

      {player === 'connecting' && (
        <p className="rounded-2xl border border-line bg-bg p-4 text-sm text-muted" aria-busy="true">
          Connecting to Spotify…
        </p>
      )}

      {player === 'notReady' && (
        <div className="rounded-2xl border border-line bg-bg p-4">
          <p className="text-sm">The player went offline.</p>
          <Button
            className="mt-3 h-10 px-5 text-sm"
            onClick={() => {
              disconnectPlayer();
              connectPlayer();
            }}
          >
            Reconnect player
          </Button>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium text-muted">Your playlists</h3>
        <PlaylistPicker mode="play" />
      </div>
    </div>
  );
}
