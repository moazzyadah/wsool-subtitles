import { NextRequest, NextResponse } from 'next/server';

/**
 * Localhost-only guard. Rejects requests from any non-loopback origin
 * unless ALLOW_LAN=true. Protects users who run `next dev --hostname 0.0.0.0`
 * or expose the dev server on a coffee-shop wifi.
 */
export function middleware(request: NextRequest) {
  if (process.env.ALLOW_LAN === 'true') return NextResponse.next();

  const host = request.headers.get('host') ?? '';
  const hostname = host.split(':')[0];

  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1';

  if (!isLocal) {
    return new NextResponse('Forbidden — set ALLOW_LAN=true to allow non-localhost access', {
      status: 403,
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
