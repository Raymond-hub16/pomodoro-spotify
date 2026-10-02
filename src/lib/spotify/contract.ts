/**
 * Internal API contract between the browser and our route handlers.
 * Shared by server and client; the client parses every response with these
 * schemas instead of casting.
 */
import { z } from 'zod';

export const API_ERROR_CODES = [
  'NO_SESSION',
  'REFRESH_FAILED',
  'PREMIUM_REQUIRED',
  'NO_ACTIVE_DEVICE',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  // Additions to the spec table, see README:
  'BAD_REQUEST',
  'FORBIDDEN',
  'NOT_CONFIGURED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ApiErrorBodySchema = z.object({
  error: z.object({ code: z.enum(API_ERROR_CODES), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const TokenResponseSchema = z.object({ accessToken: z.string().min(1), expiresAt: z.number() });
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const SessionStatusSchema = z.object({ status: z.enum(['loggedIn', 'loggedOut', 'notConfigured']) });
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const MeResponseSchema = z.object({
  displayName: z.string().nullable(),
  /** 'premium' | 'free' | 'open', or null when Spotify omits it (Development Mode apps since Feb 2026). */
  product: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const PlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  owner: z.string().nullable(),
  trackCount: z.number().int().nullable(),
  uri: z.string(),
  webUrl: z.string(),
});
export type Playlist = z.infer<typeof PlaylistSchema>;

export const PlaylistsResponseSchema = z.object({
  items: z.array(PlaylistSchema),
  nextOffset: z.number().int().nullable(),
});
export type PlaylistsResponse = z.infer<typeof PlaylistsResponseSchema>;

export const PlayRequestSchema = z.object({
  playlistId: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
  deviceId: z.string().min(1).max(200),
});

export const TransferRequestSchema = z.object({ deviceId: z.string().min(1).max(200) });

export const PLAYLISTS_PAGE_LIMIT = 50;
