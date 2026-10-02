import 'server-only';
import { NextResponse } from 'next/server';
import type { ApiErrorBody, ApiErrorCode } from './contract';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly retryAfter: string | null = null,
    /** Machine-readable cause for logs and the login callback (e.g. Spotify's `invalid_client`). Never shown raw. */
    readonly reason: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Spotify answered 401 to an API call: the access token was rejected. Internal only, triggers one forced refresh. */
export class SpotifyUnauthorizedError extends Error {
  constructor() {
    super('Spotify rejected the access token');
    this.name = 'SpotifyUnauthorizedError';
  }
}

export const errors = {
  noSession: () => new ApiError('NO_SESSION', 401, 'Belum login ke Spotify'),
  refreshFailed: (reason: string | null = null) =>
    new ApiError('REFRESH_FAILED', 401, 'Sesi Spotify berakhir, silakan login ulang', null, reason),
  premiumRequired: () => new ApiError('PREMIUM_REQUIRED', 403, 'Butuh akun Spotify Premium untuk memutar di dalam app'),
  noActiveDevice: () => new ApiError('NO_ACTIVE_DEVICE', 409, 'Tidak ada device Spotify yang aktif'),
  rateLimited: (retryAfter: string | null) => new ApiError('RATE_LIMITED', 429, 'Terlalu banyak request ke Spotify', retryAfter),
  upstream: (detail = 'Spotify sedang bermasalah', reason: string | null = null) =>
    new ApiError('UPSTREAM_ERROR', 502, detail, null, reason),
  badRequest: (detail: string) => new ApiError('BAD_REQUEST', 400, detail),
  forbidden: (detail: string) => new ApiError('FORBIDDEN', 403, detail),
  notConfigured: () =>
    new ApiError('NOT_CONFIGURED', 503, 'Kredensial Spotify belum diisi di environment server (.env)'),
  internal: () => new ApiError('INTERNAL_ERROR', 500, 'Terjadi kesalahan di server'),
};

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  let apiError: ApiError;
  if (error instanceof ApiError) apiError = error;
  else if (error instanceof SpotifyUnauthorizedError) apiError = errors.refreshFailed();
  else {
    // Never log the error object itself: it may carry request details. Name only.
    console.error('Unhandled route error:', error instanceof Error ? error.name : typeof error);
    apiError = errors.internal();
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (apiError.retryAfter !== null) headers.set('Retry-After', apiError.retryAfter);
  return NextResponse.json({ error: { code: apiError.code, message: apiError.message } }, { status: apiError.status, headers });
}
