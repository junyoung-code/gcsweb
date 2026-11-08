import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isSalesManagement = pathname === '/sales-management' || pathname.startsWith('/sales-management/');
  if (!isSalesManagement && !pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token || (isSalesManagement && (typeof token.id !== 'string' || !token.id.trim()))) {
    const loginUrl = new URL('/login', request.url);
    if (isSalesManagement) {
      loginUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/sales-management/:path*'],
};
