import { NextResponse } from 'next/server';

/**
 * Loopback enforcement is done ENTIRELY by the bind address.
 *
 * `npm run dev` / `npm start` bind to 127.0.0.1, so a remote client cannot
 * reach the server in the first place. `npm run dev:lan` / `start:lan` opt
 * the user into 0.0.0.0 binding for explicit LAN exposure.
 *
 * We previously inspected `x-forwarded-for` / `x-real-ip` here as a secondary
 * check. That check is removed: those headers are client-controlled and
 * trivially spoofable, so a remote attacker can forge `x-forwarded-for: 127.0.0.1`
 * and bypass the guard. Inspecting them gives false confidence — the bind
 * address is the only reliable control.
 */
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
