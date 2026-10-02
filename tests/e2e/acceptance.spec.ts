import { expect, test, type Page } from '@playwright/test';
import { stubNotifications, stubSpotifyLoggedOut } from './helpers';

/**
 * Acceptance criteria from the spec that can be automated. Spotify is always
 * stubbed: route handlers are mocked at the network layer and the Web Playback
 * SDK is replaced by a small fake that records what the app asks it to do.
 */

const FAST_FOCUS_SETTINGS = {
  durations: { focus: 5, shortBreak: 300, longBreak: 900 },
  longBreakEvery: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  soundEnabled: false,
  notificationsEnabled: false,
  pauseMusicOnBreak: true,
};

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const PLAYLIST_PAGE = {
  items: [
    { id: 'p1', name: 'Deep Work', imageUrl: null, owner: 'Ray', trackCount: 12, uri: 'spotify:playlist:p1', webUrl: 'https://open.spotify.com/playlist/p1' },
    { id: 'p2', name: 'Lo-fi Beats', imageUrl: null, owner: 'Ray', trackCount: 40, uri: 'spotify:playlist:p2', webUrl: 'https://open.spotify.com/playlist/p2' },
  ],
  nextOffset: null,
};

async function stubLoggedIn(page: Page, product: string | null) {
  await page.route('**/api/auth/session', (r) => r.fulfill({ json: { status: 'loggedIn' } }));
  await page.route('**/api/spotify/me', (r) => r.fulfill({ json: { displayName: 'Ray', product, imageUrl: null } }));
  await page.route('**/api/spotify/playlists**', (r) => r.fulfill({ json: PLAYLIST_PAGE }));
  await page.route('**/api/spotify/token**', (r) =>
    r.fulfill({ json: { accessToken: 'fake-access-token', expiresAt: Date.now() + 3_600_000 } }),
  );
}

const FAKE_SDK = `
(() => {
  const log = (window.__player = { calls: [], instance: null });
  class Player {
    constructor(options) { this.options = options; this.listeners = {}; this.paused = true; log.instance = this; }
    addListener(event, cb) { (this.listeners[event] ||= []).push(cb); return true; }
    removeListener() { return true; }
    emit(event, payload) { (this.listeners[event] || []).forEach((cb) => cb(payload)); }
    state() {
      return {
        context: { uri: 'spotify:playlist:p1', metadata: {} }, disallows: {}, paused: this.paused, position: 0,
        repeat_mode: 0, shuffle: false,
        track_window: {
          current_track: { uri: 'spotify:track:t1', id: 't1', type: 'track', media_type: 'audio', name: 'Test Track',
            is_playable: true, album: { uri: '', name: 'Album', images: [] }, artists: [{ uri: '', name: 'Test Artist' }] },
          previous_tracks: [], next_tracks: [],
        },
      };
    }
    simulateRemotePlay() { this.paused = false; this.emit('player_state_changed', this.state()); }
    activateElement() { log.calls.push('activateElement'); return Promise.resolve(); }
    connect() {
      log.calls.push('connect');
      this.options.getOAuthToken((token) => { log.token = token; setTimeout(() => this.emit('ready', { device_id: 'fake-device' }), 20); });
      return Promise.resolve(true);
    }
    disconnect() { log.calls.push('disconnect'); }
    getCurrentState() { return Promise.resolve(this.state()); }
    pause() { log.calls.push('pause'); this.paused = true; this.emit('player_state_changed', this.state()); return Promise.resolve(); }
    resume() { log.calls.push('resume'); this.paused = false; this.emit('player_state_changed', this.state()); return Promise.resolve(); }
    togglePlay() { return this.paused ? this.resume() : this.pause(); }
    nextTrack() { log.calls.push('nextTrack'); return Promise.resolve(); }
    previousTrack() { log.calls.push('previousTrack'); return Promise.resolve(); }
    setVolume(v) { log.volume = v; return Promise.resolve(); }
    getVolume() { return Promise.resolve(0.5); }
  }
  window.Spotify = { Player };
  window.onSpotifyWebPlaybackSDKReady();
})();
`;

declare global {
  interface Window {
    __player?: { calls: string[]; token?: string; instance: { simulateRemotePlay(): void } | null };
  }
}

test('reload in the middle of a focus session continues from the right position', async ({ page }) => {
  await stubSpotifyLoggedOut(page);
  await page.goto('/');
  await page.getByTestId('primary-control').click();
  await page.waitForTimeout(2_200);
  await page.reload();

  await expect(page.getByTestId('primary-control')).toHaveText(/Pause/);
  const shown = await page.getByRole('timer').locator('p').first().innerText();
  // Started at 25:00, ~2 s elapsed before reload plus reload time.
  expect(shown).toMatch(/^24:5[4-8]$/);
});

test('a throttled background tab (sparse ticks) shows the wall-clock remaining time', async ({ page }) => {
  await stubSpotifyLoggedOut(page);
  await page.clock.install({ time: new Date('2026-10-01T09:00:00') });
  await page.goto('/');
  await page.getByTestId('primary-control').click();
  await expect(page.getByRole('timer')).toContainText('25:00');

  // Jump 10 minutes; due timers fire at most once, like a heavily throttled tab.
  await page.clock.fastForward('10:00');
  await expect(page.getByRole('timer')).toContainText('15:00');
  await page.clock.fastForward('09:59');
  await expect(page.getByRole('timer')).toContainText('05:01');
});

test('a Free account gets the fallback panel, never loads the SDK, and logs no console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const sdkRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('sdk.scdn.co')) sdkRequests.push(r.url());
  });
  await stubLoggedIn(page, 'free');

  await page.goto('/');
  await expect(page.getByTestId('spotify-fallback')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect player' })).toHaveCount(0);
  const open = page.getByRole('link', { name: 'Open Deep Work in the Spotify app' });
  await expect(open).toHaveAttribute('href', 'spotify:playlist:p1');
  await expect(page.getByRole('link', { name: /Open Deep Work in Spotify on the web/ })).toHaveAttribute(
    'href',
    'https://open.spotify.com/playlist/p1',
  );

  await page.waitForTimeout(500);
  expect(sdkRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('Premium: the playlist plays in the tab and pauses on its own when a break starts', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await stubNotifications(page);
  await page.addInitScript((settings) => {
    localStorage.setItem('pomodoro:settings:v1', JSON.stringify(settings));
  }, FAST_FOCUS_SETTINGS);
  await stubLoggedIn(page, 'premium');
  await page.route('https://sdk.scdn.co/spotify-player.js', (r) => r.fulfill({ contentType: 'application/javascript', body: FAKE_SDK }));

  const playBodies: unknown[] = [];
  await page.route('**/api/spotify/play', async (r) => {
    playBodies.push(r.request().postDataJSON());
    await r.fulfill({ status: 204 });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Connect player' }).click();
  await expect(page.getByTestId('player-bar')).toBeVisible();

  await page.getByRole('button', { name: /Deep Work/ }).click();
  await expect.poll(() => playBodies).toEqual([{ playlistId: 'p1', deviceId: 'fake-device' }]);
  await page.evaluate(() => window.__player?.instance?.simulateRemotePlay());
  await expect(page.getByTestId('player-bar')).toContainText('Test Track');
  await expect(page.getByRole('button', { name: 'Pause music' })).toBeVisible();

  const stored = await page.evaluate(() => localStorage.getItem('pomodoro:spotify:v1'));
  expect(JSON.parse(stored ?? 'null')).toEqual({ playlistId: 'p1', playlistName: 'Deep Work' });

  // 5-second focus → short break: the timer pauses the music.
  await page.getByTestId('primary-control').click();
  await expect(page.getByTestId('active-phase')).toHaveText('Short break', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Play music' })).toBeVisible();
  expect(await page.evaluate(() => window.__player?.calls)).toContain('pause');

  // Skip back to focus and start it: the music the timer paused comes back.
  await page.keyboard.press('s');
  await expect(page.getByTestId('active-phase')).toHaveText('Focus');
  await page.getByTestId('primary-control').click();
  await expect(page.getByRole('button', { name: 'Pause music' })).toBeVisible();
  expect(await page.evaluate(() => window.__player?.calls.filter((c) => c === 'resume').length)).toBe(1);

  // Tokens never land in localStorage.
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(storage).not.toContain('fake-access-token');
  expect(errors).toEqual([]);
});

test.describe('player authentication errors', () => {
  async function connectedPremium(page: Page) {
    const calls = { logout: 0, tokenUrls: [] as string[] };
    await stubLoggedIn(page, 'premium');
    await page.route('**/api/spotify/token**', (r) => {
      calls.tokenUrls.push(r.request().url());
      return r.fulfill({ json: { accessToken: 'fake-access-token', expiresAt: Date.now() + 3_600_000 } });
    });
    await page.route('**/api/auth/logout', (r) => {
      calls.logout += 1;
      return r.fulfill({ status: 204 });
    });
    await page.route('https://sdk.scdn.co/spotify-player.js', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: FAKE_SDK }),
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect player' }).click();
    await expect(page.getByTestId('player-bar')).toBeVisible();
    return calls;
  }

  test('missing scopes end the session once, with a message that says to log in again', async ({ page }) => {
    const calls = await connectedPremium(page);
    // The SDK fires the same error more than once in a row.
    await page.evaluate(() => {
      const p = window.__player?.instance as unknown as { emit(e: string, v: unknown): void };
      p.emit('authentication_error', { message: 'Invalid token scopes.' });
      p.emit('authentication_error', { message: 'Invalid token scopes.' });
    });

    await expect(page.getByRole('status')).toContainText('needs one more Spotify permission');
    await expect(page.getByRole('link', { name: 'Log in with Spotify' })).toBeVisible();
    await page.waitForTimeout(300);
    expect(calls.logout).toBe(1);
    expect(calls.tokenUrls.some((u) => u.includes('refresh=1'))).toBe(false);
  });

  test('an expired token is refreshed once and the player reconnects', async ({ page }) => {
    const calls = await connectedPremium(page);
    await page.evaluate(() => {
      const p = window.__player?.instance as unknown as { emit(e: string, v: unknown): void };
      p.emit('authentication_error', { message: 'Authentication failed' });
    });

    await expect.poll(() => calls.tokenUrls.filter((u) => u.includes('refresh=1')).length).toBe(1);
    await expect(page.getByTestId('player-bar')).toBeVisible();
    expect(calls.logout).toBe(0);
  });
});
