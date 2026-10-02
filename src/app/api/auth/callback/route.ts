import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { readEnv } from '@/lib/spotify/env';
import { ApiError } from '@/lib/spotify/errors';
import { redirectTo } from '@/lib/spotify/redirect';
import { cookieOptions, exchangeCode, STATE_COOKIE, writeSession } from '@/lib/spotify/session';

export const dynamic = 'force-dynamic';

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Maps a failed code exchange to the `auth_error` value the page turns into a specific message. */
function exchangeErrorCode(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'REFRESH_FAILED' && (error.reason === 'invalid_client' || error.reason === 'invalid_grant')) {
      return error.reason;
    }
    if (error.code === 'UPSTREAM_ERROR' && error.reason === 'network') return 'network';
    if (error.code === 'RATE_LIMITED') return 'rate_limited';
  }
  return 'token';
}

export async function GET(request: NextRequest) {
  const env = readEnv();
  if (!env) return redirectTo('/?auth_error=not_configured');

  const params = request.nextUrl.searchParams;
  const expectedState = (await cookies()).get(STATE_COOKIE)?.value;

  // The state cookie is single-use: every outcome below removes it.
  const finish = (location: string) => {
    const response = redirectTo(location);
    response.cookies.set(STATE_COOKIE, '', cookieOptions(env, 0));
    return response;
  };

  // User pressed "Cancel" on Spotify's consent screen (or Spotify reported another error).
  const error = params.get('error');
  if (error) return finish(`/?auth_error=${error === 'access_denied' ? 'access_denied' : 'spotify'}`);

  const state = params.get('state');
  if (!state || !expectedState || !sameState(state, expectedState)) return finish('/?auth_error=state');

  const code = params.get('code');
  if (!code) return finish('/?auth_error=missing_code');

  try {
    const session = await exchangeCode(env, code);
    const response = finish('/');
    await writeSession(response, env, session);
    return response;
  } catch (error) {
    const reason = exchangeErrorCode(error);
    console.warn(`Spotify login failed at the token exchange (${reason})`);
    return finish(`/?auth_error=${reason}`);
  }
}
