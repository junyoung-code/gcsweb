// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { deleteStoreWithoutSales } from '@/lib/qrshop/store-delete';
import { DELETE } from './route';

vi.mock('@/lib/admin-auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/qrshop/store-delete', () => ({ deleteStoreWithoutSales: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: vi.fn(), delete: vi.fn() }, store: { findUnique: vi.fn() }, $transaction: vi.fn() },
}));

type Fn = ReturnType<typeof vi.fn>;
const admin = requireAdmin as unknown as Fn;
const removeStore = deleteStoreWithoutSales as unknown as Fn;
const user = prisma.user as unknown as Record<'findUnique' | 'delete', Fn>;
const store = prisma.store as unknown as Record<'findUnique', Fn>;
const transaction = prisma.$transaction as unknown as Fn;

const call = (body: unknown) =>
  DELETE(new Request('http://localhost/api', { method: 'DELETE', body: JSON.stringify(body) }), { params: { id: 'u9' } });
const OK = { confirmText: '삭제하겠습니다' };

beforeEach(() => {
  vi.resetAllMocks();
  admin.mockResolvedValue({ ok: true, session: {} });
  user.findUnique.mockResolvedValue({ id: 'u9' });
  user.delete.mockResolvedValue({});
  store.findUnique.mockResolvedValue(null);
  // 트랜잭션 클라이언트는 같은 mock 을 쓴다.
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
});

describe('DELETE /api/v2/admin/members/{id}', () => {
  it('어드민이 아니면 requireAdmin의 응답을 그대로 돌려준다', async () => {
    admin.mockResolvedValue({ ok: false, response: NextResponse.json({ status: 'error', code: 'FORBIDDEN' }, { status: 403 }) });
    expect((await call(OK)).status).toBe(403);
  });

  it('회원이 없으면 404', async () => {
    user.findUnique.mockResolvedValue(null);
    expect((await call(OK)).status).toBe(404);
  });

  it('확인 문구가 틀리면 400이고 아무것도 지우지 않는다', async () => {
    const res = await call({ confirmText: '삭제' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_INPUT');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('상점이 없으면 회원만 삭제하고 data.user.id를 돌려준다', async () => {
    const res = await call(OK);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'success', data: { user: { id: 'u9' } } });
    expect(removeStore).not.toHaveBeenCalled();
    expect(user.delete).toHaveBeenCalledWith({ where: { id: 'u9' } });
  });

  it('상점이 있으면 판매이력 판정 후 지우는 로직을 거친 뒤 회원을 삭제한다', async () => {
    store.findUnique.mockResolvedValue({ storeId: 's1' });
    removeStore.mockResolvedValue('DELETED');
    const res = await call(OK);
    expect(res.status).toBe(200);
    expect(removeStore).toHaveBeenCalledWith(prisma, 's1');
    expect(user.delete).toHaveBeenCalledTimes(1);
  });

  it('판매이력이 있는 상점은 남기고(소유자만 SetNull) 회원은 삭제한다', async () => {
    store.findUnique.mockResolvedValue({ storeId: 's1' });
    removeStore.mockResolvedValue('HAS_SALES');
    const res = await call(OK);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'success', data: { user: { id: 'u9' } } });
    expect(user.delete).toHaveBeenCalledTimes(1);
  });

  it('트랜잭션 오류는 500', async () => {
    transaction.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await call(OK)).status).toBe(500);
  });
});
