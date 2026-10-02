/**
 * Browser-side calls to our own route handlers. The browser never talks to
 * api.spotify.com directly; only the Web Playback SDK does, with the token
 * it gets from /api/spotify/token.
 */
import type { z } from 'zod';
import {
  ApiErrorBodySchema,
  MeResponseSchema,
  PlaylistsResponseSchema,
  SessionStatusSchema,
  TokenResponseSchema,
  type ApiErrorCode,
} from './contract';

export class ClientApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | 'NETWORK',
    readonly status: number,
    message: string,
    readonly retryAfter: string | null,
  ) {
    super(message);
    this.name = 'ClientApiError';
  }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...init });
  } catch {
    throw new ClientApiError('NETWORK', 0, 'Network unavailable', null);
  }
  if (res.ok) return res;
  const body = ApiErrorBodySchema.safeParse(await res.json().catch(() => null));
  throw new ClientApiError(
    body.success ? body.data.error.code : 'UPSTREAM_ERROR',
    res.status,
    body.success ? body.data.error.message : res.statusText,
    res.headers.get('Retry-After'),
  );
}

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await send(path);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ClientApiError('UPSTREAM_ERROR', res.status, 'Unexpected response', null);
  return parsed.data;
}

const putJson = (path: string, body: unknown) =>
  send(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(() => undefined);

export const spotifyApi = {
  session: () => getJson('/api/auth/session', SessionStatusSchema),
  me: () => getJson('/api/spotify/me', MeResponseSchema),
  token: (forceRefresh = false) => getJson(`/api/spotify/token${forceRefresh ? '?refresh=1' : ''}`, TokenResponseSchema),
  playlists: (offset: number) => getJson(`/api/spotify/playlists?offset=${offset}`, PlaylistsResponseSchema),
  play: (playlistId: string, deviceId: string) => putJson('/api/spotify/play', { playlistId, deviceId }),
  transfer: (deviceId: string) => putJson('/api/spotify/transfer', { deviceId }),
  logout: () => send('/api/auth/logout', { method: 'POST' }).then(() => undefined),
};

export const isSessionError = (error: unknown) =>
  error instanceof ClientApiError && (error.code === 'NO_SESSION' || error.code === 'REFRESH_FAILED');
