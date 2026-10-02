import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { TokenResponse } from '@/lib/spotify/contract';
import { withSpotifySession } from '@/lib/spotify/route';

export const dynamic = 'force-dynamic';

/**
 * The only way an access token reaches the browser (for the Web Playback SDK).
 * Refreshes automatically when fewer than 60 s remain. `?refresh=1` forces one
 * refresh; the player uses it once after an `authentication_error`.
 */
export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';
  return withSpotifySession(
    async ({ session }) =>
      NextResponse.json<TokenResponse>(
        { accessToken: session.accessToken, expiresAt: session.expiresAt },
        { headers: { 'Cache-Control': 'no-store' } },
      ),
    { forceRefresh },
  );
}
