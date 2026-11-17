import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge gate for the back office. Requests without a staff session cookie are
 * sent to sign-in with their destination preserved. This is defence in depth
 * only: every admin page, action and route still verifies the session and the
 * role on the server.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/admin/login' || pathname === '/admin/forbidden') return NextResponse.next();
  if (!request.cookies.has('infnity_admin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
