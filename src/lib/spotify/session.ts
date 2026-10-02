import 'server-only';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { sealData, unsealData } from 'iron-session';
import { z } from 'zod';
import type { ServerEnv } from './env';
import { ApiError, errors } from './errors';
import { SpotifyAuthErrorSchema, SpotifyTokenSchema, type SpotifyToken } from './schema';

export const SESSION_COOKIE = 'sp_session';
export const STATE_COOKIE = 'sp_oauth_state';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;
export const STATE_MAX_AGE_S = 10 * 60;
/** Refresh ahead of expiry rather than waiting for a 401. */
export const REFRESH_MARGIN_MS = 60_000;

const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const SessionSchema = z.object({
  refreshToken: z.string().min(1),
  accessToken: z.string().min(1),
  expiresAt: z.number(),
});
export type SessionData = z.infer<typeof SessionSchema>;

/**
 * `secure` follows the app URL's scheme rather than NODE_ENV: a production
 * build served over http://127.0.0.1 (e.g. the local Docker container) must
 * still be able to set its cookies. Any real deployment is https and gets Secure.
 */
export function cookieOptions(env: ServerEnv, maxAge = SESSION_MAX_AGE_S) {
  return {
    httpOnly: true,
    secure: env.appUrl.protocol === 'https:',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function readSession(env: ServerEnv): Promise<SessionData | null> {
  const jar = await cookies();
  const sealed = jar.get(SESSION_COOKIE)?.value;
  if (!sealed) return null;
  try {
    const data = await unsealData<unknown>(sealed, { password: env.sessionSecret, ttl: SESSION_MAX_AGE_S });
    const parsed = SessionSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeSession(response: NextResponse, env: ServerEnv, session: SessionData): Promise<void> {
  const sealed = await sealData(session, { password: env.sessionSecret, ttl: SESSION_MAX_AGE_S });
  response.cookies.set(SESSION_COOKIE, sealed, cookieOptions(env));
}

export function clearSession(response: NextResponse, env: ServerEnv): void {
  response.cookies.set(SESSION_COOKIE, '', cookieOptions(env, 0));
}

/** The low-level reason a fetch failed, without any request details. */
function describeFetchFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const cause: unknown = error.cause;
  if (cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string') return cause.code;
  return error.name;
}

async function tokenRequest(env: ServerEnv, params: Record<string, string>): Promise<SpotifyToken> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
      cache: 'no-store',
    });
  } catch (error) {
    // e.g. ENOTFOUND (DNS), ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT, SELF_SIGNED_CERT_IN_CHAIN (proxy/antivirus TLS inspection)
    console.warn(`Could not reach accounts.spotify.com (${describeFetchFailure(error)})`);
    throw errors.upstream('Tidak bisa menghubungi accounts.spotify.com', 'network');
  }

  if (res.status === 429) throw errors.rateLimited(res.headers.get('Retry-After'));
  if (res.status >= 500) throw errors.upstream();
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = SpotifyAuthErrorSchema.safeParse(body);
    // Log only the status and Spotify's error code, never tokens or the auth code.
    const reason = parsed.success ? parsed.data.error : null;
    console.warn(`Spotify token endpoint answered ${res.status} (${reason ?? 'unknown'})`);
    throw errors.refreshFailed(reason);
  }
  const token = SpotifyTokenSchema.safeParse(body);
  if (!token.success) throw errors.upstream('Respons token Spotify tidak dikenali');
  return token.data;
}

export async function exchangeCode(env: ServerEnv, code: string, now = Date.now()): Promise<SessionData> {
  const token = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: env.redirectUri });
  if (!token.refresh_token) throw errors.upstream('Spotify tidak mengirim refresh token');
  return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: now + token.expires_in * 1000 };
}

async function refresh(env: ServerEnv, session: SessionData): Promise<SessionData> {
  const token = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: session.refreshToken });
  return {
    accessToken: token.access_token,
    // Spotify sometimes rotates the refresh token. Keep the old one when it doesn't.
    refreshToken: token.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}

/**
 * One refresh per refresh token per process. Concurrent requests share the
 * in-flight promise; requests that arrive just after (still carrying the old
 * cookie) reuse the result for a short while instead of spending a refresh
 * token Spotify may already have rotated.
 */
const inFlight = new Map<string, Promise<SessionData>>();
const recent = new Map<string, { session: SessionData; until: number }>();
const RECENT_TTL_MS = 30_000;

export function resetRefreshStateForTests(): void {
  inFlight.clear();
  recent.clear();
}

export async function ensureFreshSession(
  env: ServerEnv,
  session: SessionData,
  options: { force?: boolean; now?: number } = {},
): Promise<{ session: SessionData; refreshed: boolean }> {
  const now = options.now ?? Date.now();
  if (!options.force && session.expiresAt - now > REFRESH_MARGIN_MS) return { session, refreshed: false };

  const key = session.refreshToken;
  for (const [k, v] of recent) if (v.until <= now) recent.delete(k);
  const cached = recent.get(key);
  if (!options.force && cached && cached.session.expiresAt - now > REFRESH_MARGIN_MS) {
    return { session: cached.session, refreshed: true };
  }

  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const next = await refresh(env, session);
        recent.set(key, { session: next, until: Date.now() + RECENT_TTL_MS });
        return next;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }
  return { session: await pending, refreshed: true };
}

export function isApiError(error: unknown, code: ApiError['code']): boolean {
  return error instanceof ApiError && error.code === code;
}
