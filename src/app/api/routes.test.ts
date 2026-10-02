import { sealData, unsealData } from 'iron-session';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
}));

import { GET as callback } from '@/app/api/auth/callback/route';
import { GET as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as sessionStatus } from '@/app/api/auth/session/route';
import { PUT as play } from '@/app/api/spotify/play/route';
import { GET as playlists } from '@/app/api/spotify/playlists/route';
import { GET as token } from '@/app/api/spotify/token/route';
import { resetRefreshStateForTests, type SessionData } from '@/lib/spotify/session';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const APP = 'http://127.0.0.1:3000';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const ENV = {
  SPOTIFY_CLIENT_ID: 'client-id',
  SPOTIFY_CLIENT_SECRET: 'client-secret',
  SPOTIFY_REDIRECT_URI: `${APP}/api/auth/callback`,
  SESSION_SECRET: SECRET,
  NEXT_PUBLIC_APP_URL: APP,
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal('fetch', fn);
  return fn;
}
const callsTo = (fn: ReturnType<typeof mockFetch>, prefix: string) =>
  fn.mock.calls.filter(([input]) => String(input).startsWith(prefix));

async function setSession(session: SessionData) {
  jar.set('sp_session', await sealData(session, { password: SECRET, ttl: 60 * 60 * 24 * 30 }));
}
async function readSetSession(res: Response): Promise<SessionData | null> {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('sp_session='));
  if (!cookie) return null;
  const value = decodeURIComponent(cookie.split(';')[0]!.slice('sp_session='.length));
  return value ? unsealData<SessionData>(value, { password: SECRET, ttl: 60 * 60 * 24 * 30 }) : null;
}
const setCookieFor = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

const req = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`${APP}${path}`, { headers: { host: '127.0.0.1:3000' }, ...init });

describe('route handlers', () => {
  beforeEach(() => {
    jar.clear();
    resetRefreshStateForTests();
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('/api/auth/login', () => {
    it('redirects to Spotify with minimum scopes and sets a state cookie', async () => {
      const res = await login(req('/api/auth/login'));
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get('location')!);
      expect(location.origin + location.pathname).toBe('https://accounts.spotify.com/authorize');
      expect(location.searchParams.get('response_type')).toBe('code');
      expect(location.searchParams.get('redirect_uri')).toBe(ENV.SPOTIFY_REDIRECT_URI);
      expect(location.searchParams.get('scope')).toBe(
        'user-read-private user-read-email playlist-read-private playlist-read-collaborative streaming user-modify-playback-state user-read-playback-state',
      );
      const state = location.searchParams.get('state');
      const cookie = setCookieFor(res, 'sp_oauth_state');
      expect(cookie).toContain(`sp_oauth_state=${state}`);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Max-Age=600/);
      expect(cookie).toMatch(/SameSite=lax/i);
    });

    it('moves a localhost visitor to the registered host first', async () => {
      const res = await login(new NextRequest('http://localhost:3000/api/auth/login', { headers: { host: 'localhost:3000' } }));
      expect(res.headers.get('location')).toBe(`${APP}/api/auth/login`);
      expect(setCookieFor(res, 'sp_oauth_state')).toBeUndefined();
    });

    it('reports a missing configuration instead of crashing', async () => {
      vi.stubEnv('SPOTIFY_CLIENT_SECRET', '');
      const res = await login(req('/api/auth/login'));
      expect(res.headers.get('location')).toBe('/?auth_error=not_configured');
    });
  });

  describe('/api/auth/callback', () => {
    it('rejects a state mismatch without ever calling the token endpoint', async () => {
      const fetchMock = mockFetch(() => json({}));
      jar.set('sp_oauth_state', 'expected-state');
      const res = await callback(req('/api/auth/callback?code=abc&state=forged-state'));
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/?auth_error=state');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(setCookieFor(res, 'sp_oauth_state')).toMatch(/Max-Age=0/);
    });

    it('rejects a callback when the state cookie is missing', async () => {
      const fetchMock = mockFetch(() => json({}));
      const res = await callback(req('/api/auth/callback?code=abc&state=anything'));
      expect(res.headers.get('location')).toBe('/?auth_error=state');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('handles access_denied before touching the token endpoint', async () => {
      const fetchMock = mockFetch(() => json({}));
      jar.set('sp_oauth_state', 's1');
      const res = await callback(req('/api/auth/callback?error=access_denied&state=s1'));
      expect(res.headers.get('location')).toBe('/?auth_error=access_denied');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('exchanges the code and stores a sealed session cookie', async () => {
      const fetchMock = mockFetch((url, init) => {
        expect(url).toBe(TOKEN_URL);
        expect(new Headers(init?.headers).get('authorization')).toBe(
          `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
        );
        const body = new URLSearchParams(String(init?.body));
        expect(Object.fromEntries(body)).toEqual({
          grant_type: 'authorization_code',
          code: 'the-code',
          redirect_uri: ENV.SPOTIFY_REDIRECT_URI,
        });
        return json({ access_token: 'AT1', token_type: 'Bearer', expires_in: 3600, refresh_token: 'RT1' });
      });
      jar.set('sp_oauth_state', 's1');

      const res = await callback(req('/api/auth/callback?code=the-code&state=s1'));
      expect(res.headers.get('location')).toBe('/');
      expect(callsTo(fetchMock, TOKEN_URL)).toHaveLength(1);

      const cookie = setCookieFor(res, 'sp_session')!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).not.toContain('AT1'); // sealed, not plain JSON
      const session = await readSetSession(res);
      expect(session).toMatchObject({ accessToken: 'AT1', refreshToken: 'RT1' });
    });
  });

  describe('/api/auth/callback failure reasons', () => {
    beforeEach(() => jar.set('sp_oauth_state', 's1'));
    const run = () => callback(req('/api/auth/callback?code=the-code&state=s1'));

    it('reports a rejected client secret as invalid_client', async () => {
      mockFetch(() => json({ error: 'invalid_client', error_description: 'Invalid client secret' }, { status: 400 }));
      const res = await run();
      expect(res.headers.get('location')).toBe('/?auth_error=invalid_client');
      expect(setCookieFor(res, 'sp_session')).toBeUndefined();
    });

    it('reports a rejected code as invalid_grant', async () => {
      mockFetch(() => json({ error: 'invalid_grant', error_description: 'Invalid authorization code' }, { status: 400 }));
      expect((await run()).headers.get('location')).toBe('/?auth_error=invalid_grant');
    });

    it('reports an unreachable Spotify as network and logs only the error code', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockFetch(() => {
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }) });
      });
      expect((await run()).headers.get('location')).toBe('/?auth_error=network');
      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('Could not reach accounts.spotify.com (ENOTFOUND)');
      expect(logged).not.toContain('the-code');
    });

    it('strips stray whitespace, CR and quotes from env values before using the secret', async () => {
      vi.stubEnv('SPOTIFY_CLIENT_SECRET', ' "client-secret"\r');
      vi.stubEnv('SPOTIFY_CLIENT_ID', 'client-id ');
      mockFetch((_url, init) => {
        expect(new Headers(init?.headers).get('authorization')).toBe(
          `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
        );
        return json({ access_token: 'AT1', token_type: 'Bearer', expires_in: 3600, refresh_token: 'RT1' });
      });
      expect((await run()).headers.get('location')).toBe('/');
    });
  });

  describe('/api/spotify/token', () => {
    it('returns 401 NO_SESSION without a cookie', async () => {
      const res = await token(req('/api/spotify/token'));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: 'NO_SESSION', message: 'Belum login ke Spotify' } });
    });

    it('returns a still-valid token without refreshing', async () => {
      const fetchMock = mockFetch(() => json({}));
      await setSession({ accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 30 * 60_000 });
      const res = await token(req('/api/spotify/token'));
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toMatchObject({ accessToken: 'AT' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refreshes an expiring token once and keeps the refresh token when none is returned', async () => {
      const fetchMock = mockFetch((url, init) => {
        expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
          grant_type: 'refresh_token',
          refresh_token: 'RT-old',
        });
        return json({ access_token: 'AT-new', token_type: 'Bearer', expires_in: 3600 });
      });
      await setSession({ accessToken: 'AT-old', refreshToken: 'RT-old', expiresAt: Date.now() + 30_000 });

      const res = await token(req('/api/spotify/token'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accessToken).toBe('AT-new');
      expect(body.expiresAt).toBeGreaterThan(Date.now() + 59 * 60_000);
      expect(callsTo(fetchMock, TOKEN_URL)).toHaveLength(1);
      expect(await readSetSession(res)).toMatchObject({ accessToken: 'AT-new', refreshToken: 'RT-old' });
    });

    it('stores a rotated refresh token when Spotify sends one', async () => {
      mockFetch(() => json({ access_token: 'AT-new', token_type: 'Bearer', expires_in: 3600, refresh_token: 'RT-new' }));
      await setSession({ accessToken: 'AT-old', refreshToken: 'RT-old', expiresAt: Date.now() - 1 });
      const res = await token(req('/api/spotify/token'));
      expect(await readSetSession(res)).toMatchObject({ refreshToken: 'RT-new' });
    });

    it('sends only one refresh for two concurrent requests', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const fetchMock = mockFetch(async () => {
        await gate;
        return json({ access_token: 'AT-new', token_type: 'Bearer', expires_in: 3600 });
      });
      await setSession({ accessToken: 'AT-old', refreshToken: 'RT-old', expiresAt: Date.now() - 1 });

      const pending = Promise.all([token(req('/api/spotify/token')), token(req('/api/spotify/token'))]);
      await new Promise((r) => setTimeout(r, 10));
      release();
      const [a, b] = await pending;

      expect(callsTo(fetchMock, TOKEN_URL)).toHaveLength(1);
      expect((await a.json()).accessToken).toBe('AT-new');
      expect((await b.json()).accessToken).toBe('AT-new');
    });

    it('answers 401 REFRESH_FAILED and clears the cookie when Spotify rejects the refresh', async () => {
      mockFetch(() => json({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, { status: 400 }));
      await setSession({ accessToken: 'AT-old', refreshToken: 'RT-old', expiresAt: Date.now() - 1 });

      const res = await token(req('/api/spotify/token'));
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe('REFRESH_FAILED');
      const cookie = setCookieFor(res, 'sp_session');
      expect(cookie).toMatch(/^sp_session=;/);
      expect(cookie).toMatch(/Max-Age=0/);
    });

    it('forces a refresh with ?refresh=1', async () => {
      const fetchMock = mockFetch(() => json({ access_token: 'AT-forced', token_type: 'Bearer', expires_in: 3600 }));
      await setSession({ accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 30 * 60_000 });
      const res = await token(req('/api/spotify/token?refresh=1'));
      expect((await res.json()).accessToken).toBe('AT-forced');
      expect(callsTo(fetchMock, TOKEN_URL)).toHaveLength(1);
    });
  });

  describe('/api/spotify/playlists', () => {
    beforeEach(async () => {
      await setSession({ accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 30 * 60_000 });
    });

    it('passes a 429 through with Retry-After', async () => {
      mockFetch(() => json({ error: { status: 429, message: 'API rate limit exceeded' } }, { status: 429, headers: { 'Retry-After': '17' } }));
      const res = await playlists(req('/api/spotify/playlists'));
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('17');
      expect((await res.json()).error.code).toBe('RATE_LIMITED');
    });

    it('locks limit to 50, maps both track-count shapes and drops null entries', async () => {
      const fetchMock = mockFetch((url) => {
        const u = new URL(url);
        expect(u.pathname).toBe('/v1/me/playlists');
        expect(u.searchParams.get('limit')).toBe('50');
        expect(u.searchParams.get('offset')).toBe('50');
        return json({
          limit: 50,
          offset: 50,
          total: 120,
          next: 'https://api.spotify.com/v1/me/playlists?offset=100&limit=50',
          items: [
            { id: 'p1', name: 'Deep Work', uri: 'spotify:playlist:p1', images: null, owner: { display_name: 'Ray' }, tracks: { total: 12 } },
            null,
            { id: 'p2', name: 'Lo-fi', uri: 'spotify:playlist:p2', images: [{ url: 'https://i.scdn.co/a', width: 300, height: 300 }], items: { total: 40 }, external_urls: { spotify: 'https://open.spotify.com/playlist/p2' } },
          ],
        });
      });

      const res = await playlists(req('/api/spotify/playlists?offset=50'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        nextOffset: 100,
        items: [
          { id: 'p1', name: 'Deep Work', imageUrl: null, owner: 'Ray', trackCount: 12, uri: 'spotify:playlist:p1', webUrl: 'https://open.spotify.com/playlist/p1' },
          { id: 'p2', name: 'Lo-fi', imageUrl: 'https://i.scdn.co/a', owner: null, trackCount: 40, uri: 'spotify:playlist:p2', webUrl: 'https://open.spotify.com/playlist/p2' },
        ],
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects a bad offset', async () => {
      const res = await playlists(req('/api/spotify/playlists?offset=-3'));
      expect(res.status).toBe(400);
    });

    it('retries once with a forced refresh when Spotify answers 401', async () => {
      let apiCalls = 0;
      const fetchMock = mockFetch((url) => {
        if (url === TOKEN_URL) return json({ access_token: 'AT-2', token_type: 'Bearer', expires_in: 3600 });
        apiCalls += 1;
        if (apiCalls === 1) return json({ error: { status: 401, message: 'The access token expired' } }, { status: 401 });
        return json({ limit: 50, offset: 0, total: 0, next: null, items: [] });
      });
      const res = await playlists(req('/api/spotify/playlists'));
      expect(res.status).toBe(200);
      expect(callsTo(fetchMock, TOKEN_URL)).toHaveLength(1);
      expect(await readSetSession(res)).toMatchObject({ accessToken: 'AT-2' });
    });
  });

  describe('/api/spotify/play', () => {
    beforeEach(async () => {
      await setSession({ accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 30 * 60_000 });
    });
    const playReq = (body: unknown) =>
      req('/api/spotify/play', { method: 'PUT', body: JSON.stringify(body), headers: { host: '127.0.0.1:3000', 'content-type': 'application/json' } });

    it('starts the playlist on the SDK device', async () => {
      const fetchMock = mockFetch((url, init) => {
        const u = new URL(url);
        expect(u.pathname).toBe('/v1/me/player/play');
        expect(u.searchParams.get('device_id')).toBe('dev-1');
        expect(init?.method).toBe('PUT');
        expect(JSON.parse(String(init?.body))).toEqual({ context_uri: 'spotify:playlist:abc123' });
        return new Response(null, { status: 204 });
      });
      const res = await play(playReq({ playlistId: 'abc123', deviceId: 'dev-1' }));
      expect(res.status).toBe(204);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('maps Spotify 404 NO_ACTIVE_DEVICE to 409', async () => {
      mockFetch(() => json({ error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } }, { status: 404 }));
      const res = await play(playReq({ playlistId: 'abc123', deviceId: 'dev-1' }));
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe('NO_ACTIVE_DEVICE');
    });

    it('maps a player 403 to PREMIUM_REQUIRED', async () => {
      mockFetch(() => json({ error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } }, { status: 403 }));
      const res = await play(playReq({ playlistId: 'abc123', deviceId: 'dev-1' }));
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('PREMIUM_REQUIRED');
    });

    it('maps Spotify 5xx to 502 UPSTREAM_ERROR', async () => {
      mockFetch(() => new Response('oops', { status: 503 }));
      const res = await play(playReq({ playlistId: 'abc123', deviceId: 'dev-1' }));
      expect(res.status).toBe(502);
      expect((await res.json()).error.code).toBe('UPSTREAM_ERROR');
    });

    it('validates the request body', async () => {
      const fetchMock = mockFetch(() => json({}));
      const res = await play(playReq({ playlistId: '../../me', deviceId: '' }));
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('/api/auth/session', () => {
    it('reports each state with 200 and never calls Spotify', async () => {
      const fetchMock = mockFetch(() => json({}));
      expect(await (await sessionStatus()).json()).toEqual({ status: 'loggedOut' });

      await setSession({ accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() - 1 });
      const res = await sessionStatus();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'loggedIn' });

      jar.set('sp_session', 'tampered-value');
      expect(await (await sessionStatus()).json()).toEqual({ status: 'loggedOut' });

      vi.stubEnv('SESSION_SECRET', 'too-short');
      expect(await (await sessionStatus()).json()).toEqual({ status: 'notConfigured' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('/api/auth/logout', () => {
    it('clears the session cookie with 204', async () => {
      const res = await logout(req('/api/auth/logout', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: APP } }));
      expect(res.status).toBe(204);
      expect(setCookieFor(res, 'sp_session')).toMatch(/Max-Age=0/);
    });

    it('refuses a cross-site post', async () => {
      const res = await logout(req('/api/auth/logout', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'https://evil.example' } }));
      expect(res.status).toBe(403);
    });
  });
});
