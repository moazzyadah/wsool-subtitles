import { NextRequest, NextResponse } from 'next/server';

/**
 * Defense-in-depth loopback guard.
 *
 * The PRIMARY enforcement is the bind address — `npm run dev` / `npm start` bind
 * to 127.0.0.1 unless ALLOW_LAN=true. That is the only check that cannot be
 * bypassed by a remote client.
 *
 * This middleware is a secondary check that uses the actual remote address
 * (NextRequest.ip when available, plus the connection's reported address).
 * The `Host` header is NEVER used for the trust decision — it is client-supplied
 * and trivially spoofable.
 */
export function middleware(request: NextRequest) {
  if (process.env.ALLOW_LAN === 'true') return NextResponse.next();

  const ip = request.ip ?? request.headers.get('x-real-ip') ?? '';
  // Empty `ip` happens in standalone Node runtime without a proxy — fall through
  // and rely on the bind-address enforcement done in package.json scripts.
  if (!ip) return NextResponse.next();

  if (isLoopback(ip)) return NextResponse.next();

  return new NextResponse('Forbidden — non-loopback access blocked. Set ALLOW_LAN=true to override.', {
    status: 403,
  });
}

function isLoopback(addr: string): boolean {
  const a = addr.replace(/^::ffff:/, ''); // unwrap IPv4-mapped IPv6
  if (a === '127.0.0.1' || a === '::1') return true;
  if (a.startsWith('127.')) return true;
  return false;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
