// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { config, middleware } from './middleware';

vi.mock('next-auth/jwt', () => ({ getToken: vi.fn() }));

describe('판매관리 인증 경계', () => {
  beforeEach(() => vi.mocked(getToken).mockReset());

  it('판매관리 하위 경로를 matcher에 포함한다', () => {
    expect(config.matcher).toContain('/sales-management/:path*');
  });

  it('비로그인 사용자는 원래 경로와 query를 보존해 로그인으로 보낸다', async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    const response = await middleware(new NextRequest('http://localhost:3000/sales-management/v2/products?state=empty'));
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('callbackUrl')).toBe('/sales-management/v2/products?state=empty');
  });

  it.each([undefined, '', '  '])('세션 ID가 %s이면 접근을 거절한다', async (id) => {
    vi.mocked(getToken).mockResolvedValue({ id, email: 'user@example.com' });
    const response = await middleware(new NextRequest('http://localhost:3000/sales-management'));
    expect(response.headers.get('location')).toContain('/login?callbackUrl=');
  });

  it.each(['user', 'admin'])('%s도 세션 ID가 있으면 접근한다', async (role) => {
    vi.mocked(getToken).mockResolvedValue({ id: 'user-1', role });
    const response = await middleware(new NextRequest('http://localhost:3000/sales-management/v2/store'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('공개 경로는 토큰을 조회하지 않는다', async () => {
    const response = await middleware(new NextRequest('http://localhost:3000/QRshop/v2'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(getToken).not.toHaveBeenCalled();
  });

  it('기존 admin 비로그인 리다이렉트를 유지한다', async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    const response = await middleware(new NextRequest('http://localhost:3000/admin'));
    expect(response.headers.get('location')).toBe('http://localhost:3000/login');
  });
});
