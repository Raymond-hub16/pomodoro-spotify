import { NextResponse } from 'next/server';
import { spotifyJson } from '@/lib/spotify/client';
import type { MeResponse } from '@/lib/spotify/contract';
import { withSpotifySession } from '@/lib/spotify/route';
import { SpotifyMeSchema } from '@/lib/spotify/schema';
import { pickImage } from '@/lib/spotify/images';

export const dynamic = 'force-dynamic';

export async function GET() {
  return withSpotifySession(async ({ session }) => {
    const me = await spotifyJson('/me', SpotifyMeSchema, { accessToken: session.accessToken });
    return NextResponse.json<MeResponse>(
      {
        displayName: me.display_name ?? null,
        product: me.product ?? null,
        imageUrl: pickImage(me.images, 64),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
