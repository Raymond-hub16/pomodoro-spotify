import 'server-only';
import type { z } from 'zod';
import { errors, SpotifyUnauthorizedError } from './errors';
import { SpotifyApiErrorSchema } from './schema';

const API_BASE = 'https://api.spotify.com/v1';

interface Options {
  accessToken: string;
  method?: 'GET' | 'PUT' | 'POST';
  query?: Record<string, string | number>;
  body?: unknown;
  /** Player endpoints map 403/404 to PREMIUM_REQUIRED / NO_ACTIVE_DEVICE. */
  kind?: 'data' | 'player';
}

/** GET-style call whose JSON body is validated with `schema` at the boundary. */
export async function spotifyJson<T>(path: string, schema: z.ZodType<T>, options: Options): Promise<T> {
  const res = await send(path, options);
  const json: unknown = await res.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.warn(`Unexpected Spotify response shape for ${path}`);
    throw errors.upstream('Respons Spotify tidak dikenali');
  }
  return parsed.data;
}

/** Command call (player control) whose success response carries no body we need. */
export async function spotifyCommand(path: string, options: Options): Promise<void> {
  await send(path, options);
}

/** Server-side fetch to api.spotify.com; throws a typed error for every non-2xx answer. */
async function send(path: string, options: Options): Promise<Response> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, String(v));

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
    });
  } catch {
    throw errors.upstream('Tidak bisa menghubungi api.spotify.com');
  }

  if (res.ok) return res;

  const body = SpotifyApiErrorSchema.safeParse(await res.json().catch(() => null));
  const reason = body.success ? body.data.error.reason : undefined;
  const message = body.success ? body.data.error.message : undefined;
  console.warn(`Spotify ${options.method ?? 'GET'} ${path} answered ${res.status}${reason ? ` (${reason})` : ''}`);

  if (res.status === 401) throw new SpotifyUnauthorizedError();
  if (res.status === 429) throw errors.rateLimited(res.headers.get('Retry-After'));
  if (res.status >= 500) throw errors.upstream();
  if (options.kind === 'player') {
    if (res.status === 404) throw errors.noActiveDevice();
    if (res.status === 403) throw errors.premiumRequired();
  }
  if (res.status === 403) {
    // Typical in Development Mode: the account isn't on the app's user list in the dashboard.
    throw errors.forbidden(message ?? 'Spotify menolak akses untuk akun ini');
  }
  throw errors.upstream(message ?? `Spotify membalas ${res.status}`);
}
