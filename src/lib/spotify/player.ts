/**
 * Browser-only controller for the Spotify Web Playback SDK. The player
 * instance lives here (outside React); the store only mirrors its state.
 */
import type { PlaylistRef } from '@/lib/storage/schemas';
import { onTimerEvent } from '@/lib/timer/events';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSpotifyStore, type NowPlaying } from '@/stores/spotifyStore';
import { ClientApiError, isSessionError, spotifyApi } from './api';

let player: Spotify.Player | null = null;
let forceRefreshNextToken = false;
let authRetryUsed = false;
/** True only when the timer paused the music, so we never resume music the user paused. */
let pausedByTimer = false;

const store = () => useSpotifyStore.getState();
const toast = (message: string, tone: 'info' | 'error' = 'info') => store().showToast(message, tone);

// The SDK calls this global once its script has run, so it must exist before the script loads.
if (typeof window !== 'undefined') {
  window.onSpotifyWebPlaybackSDKReady = () => useSpotifyStore.setState({ sdkLoaded: true });
  if (window.Spotify) useSpotifyStore.setState({ sdkLoaded: true });
}

function toNowPlaying(state: Spotify.PlaybackState | null): NowPlaying | null {
  if (!state) return null;
  const track = state.track_window.current_track;
  const images = [...track.album.images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const art = images.find((i) => (i.width ?? 0) >= 96) ?? images.at(-1);
  return {
    trackName: track.name,
    artists: track.artists.map((a) => a.name).join(', '),
    albumArt: art?.url ?? null,
    paused: state.paused,
    contextUri: state.context.uri,
  };
}

/** Called by the SDK on connect and whenever its token expires. Never cached here. */
function getOAuthToken(cb: (token: string) => void) {
  const force = forceRefreshNextToken;
  forceRefreshNextToken = false;
  spotifyApi
    .token(force)
    .then((t) => cb(t.accessToken))
    .catch((error: unknown) => {
      if (isSessionError(error)) void endSession('Your Spotify session ended. Log in again.');
      else toast('Could not get a Spotify token. Check your connection.', 'error');
    });
}

export function disconnectPlayer(): void {
  const p = player;
  player = null;
  pausedByTimer = false;
  try {
    p?.disconnect();
  } catch {
    /* already gone */
  }
  useSpotifyStore.setState({ player: 'off', deviceId: null, nowPlaying: null });
}

function switchToFallback(reason: 'free' | 'unsupported' | 'sdk', message: string) {
  disconnectPlayer();
  store().switchToFallback(reason);
  toast(message);
}

let endingSession = false;

/** Logs out once and shows one message. Later calls (stray SDK callbacks) are ignored. */
async function endSession(message: string) {
  if (endingSession || store().auth !== 'loggedIn') return;
  endingSession = true;
  try {
    disconnectPlayer();
    try {
      await spotifyApi.logout();
    } catch {
      /* cookie is cleared server-side on REFRESH_FAILED anyway */
    }
    store().setLoggedOut();
    toast(message, 'error');
  } finally {
    endingSession = false;
  }
}

let authRecovery: Promise<void> | null = null;

/**
 * The SDK can fire authentication_error several times in a row; only the
 * first one is handled while a recovery is running.
 */
function onAuthError(error: Spotify.PlaybackError) {
  console.warn(`Spotify player authentication_error: ${error.message}`);
  if (authRecovery) return;
  authRecovery = handleAuthError(error.message).finally(() => {
    authRecovery = null;
  });
}

async function handleAuthError(message: string) {
  const p = player;
  if (!p) return;
  if (/scope/i.test(message)) {
    // A refresh keeps the same scopes, so only a new login fixes this.
    await endSession('The player needs one more Spotify permission. Log in again to allow it.');
    return;
  }
  if (authRetryUsed) {
    await endSession('Spotify rejected the session. Log in again.');
    return;
  }
  // One forced refresh: reconnecting makes the SDK ask getOAuthToken again.
  authRetryUsed = true;
  forceRefreshNextToken = true;
  p.disconnect();
  useSpotifyStore.setState({ player: 'connecting', deviceId: null });
  const ok = await p.connect().catch(() => false);
  if (!ok && player === p) await endSession('Spotify rejected the session. Log in again.');
}

/** Must be called from a click handler: browsers block audio that doesn't start from a user gesture. */
export function connectPlayer(): void {
  if (typeof window === 'undefined' || !window.Spotify || player) return;
  const s = store();
  if (s.mode === 'fallback' || s.auth !== 'loggedIn') return;

  useSpotifyStore.setState({ player: 'connecting' });
  const p = new window.Spotify.Player({ name: 'Pomodoro Timer', getOAuthToken, volume: s.volume });

  p.addListener('ready', ({ device_id }) => {
    authRetryUsed = false;
    useSpotifyStore.setState({ player: 'ready', deviceId: device_id });
  });
  p.addListener('not_ready', () => useSpotifyStore.setState({ player: 'notReady', deviceId: null }));
  p.addListener('player_state_changed', (state) => useSpotifyStore.setState({ nowPlaying: toNowPlaying(state) }));
  // SDK messages are logged as warnings (never tokens) so problems can be diagnosed from the console.
  p.addListener('initialization_error', (e) => {
    console.warn(`Spotify player initialization_error: ${e.message}`);
    switchToFallback('unsupported', 'This browser can’t play Spotify in a tab. Open playlists in the Spotify app instead.');
  });
  p.addListener('account_error', (e) => {
    console.warn(`Spotify player account_error: ${e.message}`);
    switchToFallback('free', 'Playing inside this tab needs Spotify Premium. Open playlists in the Spotify app instead.');
  });
  p.addListener('authentication_error', onAuthError);
  p.addListener('playback_error', (e) => {
    console.warn(`Spotify player playback_error: ${e.message}`);
    toast('That track can’t be played. Skipping to the next one.', 'error');
    void p.nextTrack().catch(() => undefined);
  });
  p.addListener('autoplay_failed', () => toast('The browser blocked autoplay. Press play to start the music.'));

  player = p;
  void p.activateElement().catch(() => undefined);
  void p
    .connect()
    .then((ok) => {
      if (!ok && player === p) {
        disconnectPlayer();
        toast('Could not connect the Spotify player. Try again.', 'error');
      }
    })
    .catch(() => undefined);
}

export function sdkFailedToLoad(): void {
  switchToFallback('sdk', 'The Spotify player could not load. Open playlists in the Spotify app instead.');
}

function reportPlaybackError(error: unknown) {
  if (isSessionError(error)) {
    void endSession('Your Spotify session ended. Log in again.');
    return;
  }
  if (error instanceof ClientApiError) {
    switch (error.code) {
      case 'PREMIUM_REQUIRED':
        switchToFallback('free', 'Playing inside this tab needs Spotify Premium. Open playlists in the Spotify app instead.');
        return;
      case 'RATE_LIMITED':
        toast(`Spotify is busy. Try again in ${error.retryAfter ?? 'a few'} seconds.`, 'error');
        return;
      case 'NETWORK':
        toast('You are offline. The timer keeps running; music needs a connection.', 'error');
        return;
      case 'NO_ACTIVE_DEVICE':
        toast('Spotify lost this tab as a player. Reconnect the player.', 'error');
        return;
    }
  }
  toast('Couldn’t start the playlist. Try again.', 'error');
}

export async function playPlaylist(ref: PlaylistRef): Promise<void> {
  store().select(ref);
  const { deviceId } = store();
  if (!deviceId || !player) return;
  pausedByTimer = false;
  try {
    await spotifyApi.play(ref.playlistId, deviceId);
  } catch (error) {
    if (error instanceof ClientApiError && error.code === 'NO_ACTIVE_DEVICE') {
      // The SDK device may not be registered with Spotify yet: transfer, then retry once.
      try {
        await spotifyApi.transfer(deviceId);
        await spotifyApi.play(ref.playlistId, deviceId);
        return;
      } catch (retryError) {
        reportPlaybackError(retryError);
        return;
      }
    }
    reportPlaybackError(error);
  }
}

const guard = (action: () => Promise<void> | undefined) => {
  action()?.catch(() => toast('The player didn’t respond. Try again.', 'error'));
};

export const playerControls = {
  toggle: () =>
    guard(() => {
      pausedByTimer = false;
      return player?.togglePlay();
    }),
  next: () => guard(() => player?.nextTrack()),
  previous: () => guard(() => player?.previousTrack()),
  setVolume: (volume: number) =>
    guard(() => {
      useSpotifyStore.setState({ volume });
      return player?.setVolume(volume);
    }),
};

/**
 * Timer → music. The engine only emits phase events; this subscriber decides
 * what the player does. Pauses when a break starts, and resumes once a focus
 * phase is actually running again (and only if the timer did the pausing).
 */
export function attachMusicAutoPause(): () => void {
  return onTimerEvent((event) => {
    const p = player;
    if (!p || store().player !== 'ready') return;

    if (event.type === 'phaseChanged' && event.to !== 'focus') {
      if (!useSettingsStore.getState().pauseMusicOnBreak) return;
      void p
        .getCurrentState()
        .then(async (state) => {
          if (state && !state.paused) {
            await p.pause();
            pausedByTimer = true;
          }
        })
        .catch(() => undefined);
      return;
    }

    const focusRunning =
      (event.type === 'phaseChanged' && event.to === 'focus' && event.autoStarted) ||
      ((event.type === 'started' || event.type === 'resumed') && event.phase === 'focus');
    if (focusRunning && pausedByTimer) {
      pausedByTimer = false;
      void p.resume().catch(() => undefined);
    }
  });
}

export async function loadSession(): Promise<void> {
  try {
    const { status } = await spotifyApi.session();
    if (status === 'notConfigured') {
      store().setNotConfigured();
      return;
    }
    if (status === 'loggedOut') {
      store().setLoggedOut();
      return;
    }
    store().setLoggedIn(await spotifyApi.me());
  } catch (error) {
    if (error instanceof ClientApiError) {
      if (error.code === 'NOT_CONFIGURED') {
        store().setNotConfigured();
        return;
      }
      if (error.code === 'FORBIDDEN') {
        toast(`Spotify refused this account (${error.message}). In Development Mode, add it under User Management in the Spotify dashboard.`, 'error');
      } else if (error.code === 'NETWORK') {
        toast('Couldn’t reach the server to check your Spotify login.', 'error');
      }
    }
    store().setLoggedOut();
  }
}

export async function logout(): Promise<void> {
  disconnectPlayer();
  try {
    await spotifyApi.logout();
  } catch {
    toast('Couldn’t reach the server. You are logged out in this tab only.', 'error');
  }
  store().setLoggedOut();
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Spotify login was cancelled.',
  state: 'The login check failed. Please log in again.',
  invalid_client:
    'Spotify rejected the client secret. Copy the Client secret again from the dashboard into .env.local, then restart the app (docker compose up -d).',
  invalid_grant:
    'Spotify rejected the login code. Check that SPOTIFY_REDIRECT_URI matches the dashboard exactly, then log in again.',
  network:
    'The app server couldn’t reach accounts.spotify.com. Check the internet connection, proxy or antivirus on the computer running the app.',
  rate_limited: 'Spotify is limiting login attempts. Wait a minute and try again.',
  token: 'Spotify didn’t accept the login. The app’s server log shows the reason.',
};

/** Reads and removes ?auth_error=… left by the OAuth callback. */
export function consumeAuthErrorParam(): void {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('auth_error');
  if (!code) return;
  url.searchParams.delete('auth_error');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  if (code === 'not_configured') return; // the panel explains it via /api/spotify/me
  toast(AUTH_ERROR_MESSAGES[code] ?? 'Spotify login didn’t finish. Please try again.', 'error');
}
