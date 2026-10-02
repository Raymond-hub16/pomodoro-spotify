/**
 * Zod schemas for responses from accounts.spotify.com and api.spotify.com.
 * Everything Spotify sends is parsed here, at the boundary.
 *
 * Kept lenient on purpose: since the February 2026 Web API changes,
 * Development Mode apps no longer receive `product` on GET /me, and the
 * playlist field `tracks` was renamed to `items`.
 * Source: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
 */
import { z } from 'zod';

export const SpotifyTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});
export type SpotifyToken = z.infer<typeof SpotifyTokenSchema>;

export const SpotifyImageSchema = z.object({
  url: z.string().min(1),
  height: z.number().nullish(),
  width: z.number().nullish(),
});
export type SpotifyImage = z.infer<typeof SpotifyImageSchema>;

export const SpotifyMeSchema = z.object({
  id: z.string(),
  display_name: z.string().nullish(),
  product: z.string().optional(),
  images: z.array(SpotifyImageSchema).nullish(),
});

const TrackCountSchema = z.object({ total: z.number().int() });

export const SpotifyPlaylistSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  uri: z.string(),
  images: z.array(SpotifyImageSchema).nullish(),
  owner: z.object({ display_name: z.string().nullish() }).nullish(),
  external_urls: z.object({ spotify: z.string().optional() }).nullish(),
  tracks: TrackCountSchema.nullish(), // Extended Quota Mode apps
  items: TrackCountSchema.nullish(), // Development Mode apps (renamed Feb 2026)
});
export type SpotifyPlaylist = z.infer<typeof SpotifyPlaylistSchema>;

/** Items are validated one by one so a single odd (or null) playlist doesn't break the page. */
export const SpotifyPlaylistPageSchema = z.object({
  items: z.array(z.unknown()),
  limit: z.number().int(),
  offset: z.number().int(),
  total: z.number().int().optional(),
  next: z.string().nullable(),
});

export const SpotifyApiErrorSchema = z.object({
  error: z.object({
    status: z.number().optional(),
    message: z.string().optional(),
    reason: z.string().optional(),
  }),
});

export const SpotifyAuthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});
