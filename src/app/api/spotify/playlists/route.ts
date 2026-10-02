import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { spotifyJson } from '@/lib/spotify/client';
import { PLAYLISTS_PAGE_LIMIT, type Playlist, type PlaylistsResponse } from '@/lib/spotify/contract';
import { errorResponse, errors } from '@/lib/spotify/errors';
import { pickImage } from '@/lib/spotify/images';
import { withSpotifySession } from '@/lib/spotify/route';
import { SpotifyPlaylistPageSchema, SpotifyPlaylistSchema } from '@/lib/spotify/schema';

export const dynamic = 'force-dynamic';

const OffsetSchema = z.coerce.number().int().min(0).max(100_000);

export async function GET(request: NextRequest) {
  const rawOffset = request.nextUrl.searchParams.get('offset') ?? '0';
  const offset = OffsetSchema.safeParse(rawOffset);
  if (!offset.success) return errorResponse(errors.badRequest('offset harus bilangan bulat >= 0'));

  return withSpotifySession(async ({ session }) => {
    const page = await spotifyJson('/me/playlists', SpotifyPlaylistPageSchema, {
      accessToken: session.accessToken,
      query: { limit: PLAYLISTS_PAGE_LIMIT, offset: offset.data },
    });

    const items: Playlist[] = [];
    for (const raw of page.items) {
      const parsed = SpotifyPlaylistSchema.safeParse(raw);
      if (!parsed.success) continue; // Spotify occasionally returns null entries here
      const p = parsed.data;
      items.push({
        id: p.id,
        name: p.name,
        imageUrl: pickImage(p.images, 96),
        owner: p.owner?.display_name ?? null,
        trackCount: p.tracks?.total ?? p.items?.total ?? null,
        uri: p.uri,
        webUrl: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`,
      });
    }

    return NextResponse.json<PlaylistsResponse>(
      { items, nextOffset: page.next ? page.offset + page.limit : null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
