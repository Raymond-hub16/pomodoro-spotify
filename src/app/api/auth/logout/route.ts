import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { readEnv } from '@/lib/spotify/env';
import { errorResponse, errors } from '@/lib/spotify/errors';
import { clearSession } from '@/lib/spotify/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const env = readEnv();
  if (!env) return errorResponse(errors.notConfigured());

  // Refuse cross-site form posts: logging someone out should take their own click.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.headers.get('host')) {
    return errorResponse(errors.forbidden('Origin tidak diizinkan'));
  }

  const response = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  clearSession(response, env);
  return response;
}
