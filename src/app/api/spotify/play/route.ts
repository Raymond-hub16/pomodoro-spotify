import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { spotifyCommand } from '@/lib/spotify/client';
import { PlayRequestSchema } from '@/lib/spotify/contract';
import { errorResponse, errors } from '@/lib/spotify/errors';
import { readJsonBody, withSpotifySession } from '@/lib/spotify/route';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  let input;
  try {
    input = PlayRequestSchema.safeParse(await readJsonBody(request));
  } catch (error) {
    return errorResponse(error);
  }
  if (!input.success) return errorResponse(errors.badRequest('Butuh playlistId dan deviceId yang valid'));
  const { playlistId, deviceId } = input.data;

  return withSpotifySession(async ({ session }) => {
    await spotifyCommand('/me/player/play', {
      accessToken: session.accessToken,
      method: 'PUT',
      kind: 'player',
      query: { device_id: deviceId },
      body: { context_uri: `spotify:playlist:${playlistId}` },
    });
    return new NextResponse(null, { status: 204 });
  });
}
