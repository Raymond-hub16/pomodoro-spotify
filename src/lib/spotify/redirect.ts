import 'server-only';
import { NextResponse } from 'next/server';

/** 302 with a relative Location, so the browser stays on whatever host it used. */
export function redirectTo(location: string): NextResponse {
  return new NextResponse(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } });
}
