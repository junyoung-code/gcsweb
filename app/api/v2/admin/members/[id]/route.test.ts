// @vitest-environment node
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { DELETE } from './route';

vi.mock('@/lib/admin-auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: vi.fn(), delete: vi.fn() }, store: { findUnique: vi.fn() } },
}));

const admin = requireAdmin as unknown as ReturnType<typeof vi.fn>;
const user = prisma.user as unknown as Record<'findUnique' | 'delete', ReturnType<typeof vi.fn>>;
const store = prisma.store as unknown as Record<'findUnique', ReturnType<typeof vi.fn>>;

const call = (body: unknown) =>
  DELETE(new Request('http://localhost/api', { method: 'DELETE', body: JSON.stringify(body) }), { params: { id: 'u9' } });

beforeEach(() => {
  vi.resetAllMocks();
  admin.mockResolvedValue({ ok: true, session: {} });
  user.findUnique.mockResolvedValue({ id: 'u9' });
  store.findUnique.mockResolvedValue(null);
});

describe('DELETE /api/v2/admin/members/{id}', () => {
  it('어드민이 아니면 requireAdmin의 응답을 그대로 돌려준다', async () => {
    admin.mockResolvedValue({ ok: false, response: NextResponse.json({ status: 'error', code: 'FORBIDDEN' }, { status: 403 }) });
    expect((await call({ confirmText: '삭제하겠습니다' })).status).toBe(403);
  });

  it('회원이 없으면 404', async () => {
    user.findUnique.mockResolvedValue(null);
    expect((await call({ confirmText: '삭제하겠습니다' })).status).toBe(404);
  });

  it('확인 문구가 틀리면 400', async () => {
    const res = await call({ confirmText: '삭제' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_INPUT');
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('상점이 있는 회원은 확인 문구가 맞아도 409 STORE_EXISTS', async () => {
    store.findUnique.mockResolvedValue({ storeId: 's1' });
    const res = await call({ confirmText: '삭제하겠습니다' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('STORE_EXISTS');
    expect(user.delete).not.toHaveBeenCalled();
  });

  it('확인 후 삭제 사이에 상점이 생겨 FK(P2003)가 막으면 409', async () => {
    user.delete.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }));
    expect((await call({ confirmText: '삭제하겠습니다' })).status).toBe(409);
  });

  it('상점이 없으면 삭제하고 data.user.id를 돌려준다', async () => {
    user.delete.mockResolvedValue({});
    const res = await call({ confirmText: '삭제하겠습니다' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'success', data: { user: { id: 'u9' } } });
  });
});
