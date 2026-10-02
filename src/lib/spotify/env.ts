import 'server-only';
import { z } from 'zod';

const EnvSchema = z.object({
  SPOTIFY_CLIENT_ID: z.string().min(1),
  SPOTIFY_CLIENT_SECRET: z.string().min(1),
  SPOTIFY_REDIRECT_URI: z.url(),
  SESSION_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.url(),
});

const ENV_KEYS = Object.keys(EnvSchema.shape) as (keyof typeof EnvSchema.shape)[];

/**
 * Values copied into .env files often carry a trailing space, a Windows `\r`,
 * or quotes that a given loader keeps literally (`docker run --env-file`).
 * Any of those makes Spotify reject the client secret with `invalid_client`.
 */
function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  return quoted ? (quoted[2] ?? '').trim() : trimmed;
}

export interface ServerEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  sessionSecret: string;
  appUrl: URL;
}

/**
 * Read at request time (not at module load) so a missing value only disables
 * Spotify: the timer keeps working without any credentials.
 * `process.env` is passed as a whole on purpose so nothing gets inlined at build time.
 */
export function readEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv | null {
  const cleaned = Object.fromEntries(ENV_KEYS.map((key) => [key, clean(source[key])]));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) return null;
  const e = parsed.data;
  return {
    clientId: e.SPOTIFY_CLIENT_ID,
    clientSecret: e.SPOTIFY_CLIENT_SECRET,
    redirectUri: e.SPOTIFY_REDIRECT_URI,
    sessionSecret: e.SESSION_SECRET,
    appUrl: new URL(e.NEXT_PUBLIC_APP_URL),
  };
}

/**
 * The Web Playback SDK refuses tokens without streaming, user-read-email and
 * user-read-private ("Invalid token scopes"), so user-read-email is required
 * even though the app itself never reads the email.
 */
export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
  'user-modify-playback-state',
  'user-read-playback-state',
] as const;
