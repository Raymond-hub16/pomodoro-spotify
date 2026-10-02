import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { readEnv, SPOTIFY_SCOPES } from '@/lib/spotify/env';
import { redirectTo } from '@/lib/spotify/redirect';
import { cookieOptions, STATE_COOKIE, STATE_MAX_AGE_S } from '@/lib/spotify/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const env = readEnv();
  if (!env) return redirectTo('/?auth_error=not_configured');

  // Cookies are per host: if the app was opened on another host (typically
  // "localhost" instead of the registered 127.0.0.1), move there first so the
  // state cookie and the callback land on the same origin.
  const host = request.headers.get('host');
  if (host && host !== env.appUrl.host) {
    return NextResponse.redirect(new URL('/api/auth/login', env.appUrl), 302);
  }

  const state = crypto.randomUUID();
  const authorize = new URL('https://accounts.spotify.com/authorize');
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.clientId,
    scope: SPOTIFY_SCOPES.join(' '),
    redirect_uri: env.redirectUri,
    state,
  }).toString();

  const response = NextResponse.redirect(authorize, 302);
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(STATE_COOKIE, state, cookieOptions(env, STATE_MAX_AGE_S));
  return response;
}
