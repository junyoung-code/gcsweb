// @vitest-environment node
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { GET as getCheckId } from './check-id/route';
import { GET as getMe } from './me/route';
import { POST } from './route';
import { DELETE, GET as getStore, PATCH } from './[storeId]/route';
import { deleteStoreWithoutSales } from '@/lib/qrshop/store-delete';
import { GET as getQrCode } from './[storeId]/qrcode/route';

vi.mock('@/lib/db', () => ({
  prisma: {
    store: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/qrshop/store-delete', () => ({ deleteStoreWithoutSales: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const store = prisma.store as unknown as Record<'findUnique' | 'findFirst' | 'create' | 'update', ReturnType<typeof vi.fn>>;
const session = getServerSession as unknown as ReturnType<typeof vi.fn>;

const json = (body: unknown) =>
  new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const uniqueError = (target: string) =>
  new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test', meta: { target: [target] } });
const ctx = (storeId = 's1') => ({ params: { storeId } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXTAUTH_URL', 'https://example.com');
  session.mockResolvedValue({ user: { id: 'u1' } });
});

describe('POST /api/v2/qrshop/stores', () => {
  it('비로그인은 401', async () => {
    session.mockResolvedValue(null);
    expect((await POST(json({ name: '가게', storeSlug: 'abcd' }))).status).toBe(401);
  });

  it('형식이 틀리면 400과 짧은 메시지', async () => {
    const res = await POST(json({ name: '가게', storeSlug: 'ABC' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'INVALID_INPUT', message: '유효하지 않은 상점 아이디' });
  });

  it('이미 상점이 있으면 아이디가 겹쳐도 STORE_ALREADY_EXISTS이고 생성하지 않는다', async () => {
    store.findUnique.mockResolvedValue({ storeId: 's0' });
    const res = await POST(json({ name: '가게', storeSlug: 'abcd' }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('STORE_ALREADY_EXISTS');
    expect(store.create).not.toHaveBeenCalled();
  });

  it('동시 요청으로 아이디가 겹치면 STORE_SLUG_TAKEN', async () => {
    store.findUnique.mockResolvedValue(null);
    store.create.mockRejectedValue(uniqueError('storeSlug'));
    const res = await POST(json({ name: '가게', storeSlug: 'abcd' }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('STORE_SLUG_TAKEN');
  });

  it('성공하면 @가 붙은 storeUrl을 돌려주고 소유자를 현재 사용자로 저장한다', async () => {
    store.findUnique.mockResolvedValue(null);
    store.create.mockResolvedValue({ storeId: 's1', name: '가게', storeSlug: 'abcd' });
    const res = await POST(json({ name: ' 가게 ', storeSlug: 'abcd' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'success',
      data: { storeId: 's1', name: '가게', storeSlug: 'abcd', storeUrl: 'https://example.com/QRshop/@abcd' },
    });
    expect(store.create.mock.calls[0][0].data).toEqual({ userId: 'u1', name: '가게', storeSlug: 'abcd' });
  });
});

describe('GET /api/v2/qrshop/stores/check-id', () => {
  const req = (q: string) => new Request(`http://localhost/api/v2/qrshop/stores/check-id${q}`);

  it('사용 중이 아니면 available true', async () => {
    store.findUnique.mockResolvedValue(null);
    expect(await (await getCheckId(req('?storeSlug=abcd'))).json()).toEqual({ status: 'success', data: { available: true } });
  });

  it('사용 중이면 available false', async () => {
    store.findUnique.mockResolvedValue({ storeId: 's9' });
    expect((await (await getCheckId(req('?storeSlug=abcd'))).json()).data.available).toBe(false);
  });

  it('누락·형식 불일치는 400', async () => {
    expect((await getCheckId(req(''))).status).toBe(400);
    expect((await getCheckId(req('?storeSlug=@abcd'))).status).toBe(400);
  });
});

describe('GET /api/v2/qrshop/stores/me', () => {
  it('상점이 없으면 data null', async () => {
    store.findUnique.mockResolvedValue(null);
    expect(await (await getMe()).json()).toEqual({ status: 'success', data: null });
  });

  it('상점이 있으면 createdAt 포함 상세', async () => {
    store.findUnique.mockResolvedValue({ storeId: 's1', name: '가게', storeSlug: 'abcd', createdAt: new Date('2026-10-02T00:00:00.000Z') });
    const body = await (await getMe()).json();
    expect(body.data).toMatchObject({ storeId: 's1', storeUrl: 'https://example.com/QRshop/@abcd', createdAt: '2026-10-02T00:00:00.000Z' });
  });
});

describe('GET /api/v2/qrshop/stores/{storeId}', () => {
  it('본인 상점이 아니면 404 NOT_FOUND', async () => {
    store.findFirst.mockResolvedValue(null);
    const res = await getStore(new Request('http://localhost/x'), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('NOT_FOUND');
    expect(store.findFirst.mock.calls[0][0].where).toEqual({ storeId: 's1', userId: 'u1' });
  });
});

describe('PATCH /api/v2/qrshop/stores/{storeId}', () => {
  const current = { storeId: 's1', name: '가게', storeSlug: 'abcd' };
  const patch = (body: unknown) => PATCH(json(body), ctx());

  it('둘 다 없으면 400', async () => {
    expect((await patch({})).status).toBe(400);
  });

  it('본인 상점이 아니면 404', async () => {
    store.findFirst.mockResolvedValue(null);
    expect((await patch({ name: '새이름' })).status).toBe(404);
  });

  it('상점명만 바꾸면 URL을 재발급하지 않는다', async () => {
    store.findFirst.mockResolvedValue(current);
    store.update.mockResolvedValue({ ...current, name: '새이름' });
    const body = await (await patch({ name: '새이름' })).json();
    expect(body.data).toMatchObject({ name: '새이름', storeUrl: 'https://example.com/QRshop/@abcd', urlReissued: false });
    expect(store.update.mock.calls[0][0].data).toEqual({ name: '새이름' });
  });

  it('아이디를 바꾸면 새 URL과 urlReissued true', async () => {
    store.findFirst.mockResolvedValue(current);
    store.update.mockResolvedValue({ ...current, storeSlug: 'newslug' });
    const body = await (await patch({ storeSlug: 'newslug' })).json();
    expect(body.data).toMatchObject({ storeUrl: 'https://example.com/QRshop/@newslug', urlReissued: true });
    expect(store.update.mock.calls[0][0].data).toEqual({ storeSlug: 'newslug' });
  });

  it('현재와 같은 값만 보내면 UPDATE 없이 현재 값을 돌려준다', async () => {
    store.findFirst.mockResolvedValue(current);
    const body = await (await patch({ name: '가게', storeSlug: 'abcd' })).json();
    expect(body.data).toMatchObject({ name: '가게', storeSlug: 'abcd', urlReissued: false });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('다른 상점이 쓰는 아이디면 409 STORE_SLUG_TAKEN', async () => {
    store.findFirst.mockResolvedValue(current);
    store.update.mockRejectedValue(uniqueError('storeSlug'));
    const res = await patch({ storeSlug: 'taken1' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('STORE_SLUG_TAKEN');
  });
});

describe('GET /api/v2/qrshop/stores/{storeId}/qrcode', () => {
  it('현재 storeSlug의 URL로 SVG를 만든다', async () => {
    store.findFirst.mockResolvedValue({ storeSlug: 'abcd' });
    const body = await (await getQrCode(new Request('http://localhost/x'), ctx())).json();
    expect(body.data.storeUrl).toBe('https://example.com/QRshop/@abcd');
    expect(body.data.svg).toContain('<svg');
  });

  it('본인 상점이 아니면 404', async () => {
    store.findFirst.mockResolvedValue(null);
    expect((await getQrCode(new Request('http://localhost/x'), ctx())).status).toBe(404);
  });
});

describe('DELETE /api/v2/qrshop/stores/{storeId}', () => {
  const remove = deleteStoreWithoutSales as unknown as ReturnType<typeof vi.fn>;
  const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
  });

  it('비로그인은 401', async () => {
    session.mockResolvedValue(null);
    expect((await DELETE(new Request('http://localhost/api'), ctx())).status).toBe(401);
  });

  it('내 상점이 아니면 404 (존재 여부를 숨긴다)', async () => {
    store.findFirst.mockResolvedValue(null);
    const res = await DELETE(new Request('http://localhost/api'), ctx('other'));
    expect(res.status).toBe(404);
    expect(store.findFirst.mock.calls[0][0].where).toEqual({ storeId: 'other', userId: 'u1' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('판매이력이 있으면 409 STORE_HAS_SALES', async () => {
    store.findFirst.mockResolvedValue({ storeId: 's1' });
    remove.mockResolvedValue('HAS_SALES');
    const res = await DELETE(new Request('http://localhost/api'), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'STORE_HAS_SALES', message: '판매 이력이 있는 상점' });
  });

  it('판매이력이 없으면 삭제하고 storeId를 돌려준다', async () => {
    store.findFirst.mockResolvedValue({ storeId: 's1' });
    remove.mockResolvedValue('DELETED');
    const res = await DELETE(new Request('http://localhost/api'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'success', data: { storeId: 's1' } });
  });
});
