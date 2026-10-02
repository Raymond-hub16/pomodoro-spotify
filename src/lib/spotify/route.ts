import 'server-only';
import type { NextResponse } from 'next/server';
import { readEnv, type ServerEnv } from './env';
import { ApiError, errorResponse, errors, SpotifyUnauthorizedError } from './errors';
import { clearSession, ensureFreshSession, readSession, writeSession, type SessionData } from './session';

interface Context {
  env: ServerEnv;
  session: SessionData;
}

/**
 * Wraps a route handler that needs a Spotify access token:
 * - NOT_CONFIGURED / NO_SESSION when there is nothing to work with;
 * - refreshes ahead of expiry (deduplicated) and writes the rotated cookie;
 * - if Spotify still answers 401, forces one refresh and retries once;
 * - on REFRESH_FAILED the session cookie is cleared so the client logs in again.
 */
export async function withSpotifySession(
  handler: (ctx: Context) => Promise<NextResponse>,
  options: { forceRefresh?: boolean } = {},
): Promise<NextResponse> {
  const env = readEnv();
  if (!env) return errorResponse(errors.notConfigured());
  const stored = await readSession(env);
  if (!stored) return errorResponse(errors.noSession());

  try {
    let { session, refreshed } = await ensureFreshSession(env, stored, { force: options.forceRefresh });
    let response: NextResponse;
    try {
      response = await handler({ env, session });
    } catch (error) {
      if (!(error instanceof SpotifyUnauthorizedError)) throw error;
      ({ session } = await ensureFreshSession(env, session, { force: true }));
      refreshed = true;
      response = await handler({ env, session });
    }
    if (refreshed) await writeSession(response, env, session);
    return response;
  } catch (error) {
    const response = errorResponse(error);
    const sessionIsDead =
      (error instanceof ApiError && error.code === 'REFRESH_FAILED') || error instanceof SpotifyUnauthorizedError;
    if (sessionIsDead) clearSession(response, env);
    return response;
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw errors.badRequest('Body harus JSON');
  }
}
