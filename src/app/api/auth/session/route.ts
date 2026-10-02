import { NextResponse } from 'next/server';
import type { SessionStatus } from '@/lib/spotify/contract';
import { readEnv } from '@/lib/spotify/env';
import { readSession } from '@/lib/spotify/session';

export const dynamic = 'force-dynamic';

/**
 * Always 200. Lets the page learn whether to show "Log in" without firing a
 * request that is expected to fail (a 401 on every logged-out visit would show
 * up as a red error in the browser console). Makes no call to Spotify.
 */
export async function GET() {
  const env = readEnv();
  const status: SessionStatus['status'] = !env ? 'notConfigured' : (await readSession(env)) ? 'loggedIn' : 'loggedOut';
  return NextResponse.json<SessionStatus>({ status }, { headers: { 'Cache-Control': 'no-store' } });
}
