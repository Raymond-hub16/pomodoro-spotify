import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { spotifyCommand } from '@/lib/spotify/client';
import { TransferRequestSchema } from '@/lib/spotify/contract';
import { errorResponse, errors } from '@/lib/spotify/errors';
import { readJsonBody, withSpotifySession } from '@/lib/spotify/route';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  let input;
  try {
    input = TransferRequestSchema.safeParse(await readJsonBody(request));
  } catch (error) {
    return errorResponse(error);
  }
  if (!input.success) return errorResponse(errors.badRequest('Butuh deviceId yang valid'));
  const { deviceId } = input.data;

  return withSpotifySession(async ({ session }) => {
    await spotifyCommand('/me/player', {
      accessToken: session.accessToken,
      method: 'PUT',
      kind: 'player',
      body: { device_ids: [deviceId], play: false },
    });
    return new NextResponse(null, { status: 204 });
  });
}
