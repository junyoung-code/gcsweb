// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { findPaidSoldProductIds, hasProductPaidSale } from '@/lib/qrshop/sales-history';
import { getSellerContext } from '@/lib/seller/store';
import { GET } from './route';
import { DELETE } from './[onsiteProductId]/route';

vi.mock('@/lib/seller/store', () => ({ getSellerContext: vi.fn() }));
vi.mock('@/lib/qrshop/sales-history', () => ({ hasProductPaidSale: vi.fn(), findPaidSoldProductIds: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    onsiteProduct: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

type Fn = ReturnType<typeof vi.fn>;
const context = getSellerContext as unknown as Fn;
const paidSale = hasProductPaidSale as unknown as Fn;
const soldIds = findPaidSoldProductIds as unknown as Fn;
const product = prisma.onsiteProduct as unknown as Record<
  'findMany' | 'findFirst' | 'count' | 'delete',
  Fn
>;
const transaction = prisma.$transaction as unknown as Fn;

const STORE = { storeId: 's1', name: '상점', storeSlug: 'shop', imageUrl: null };

const row = (id: string) => ({
  productId: id,
  name: `상품 ${id}`,
  imageUrl: null,
  price: 1000,
  initStock: 5,
  currentStock: 5,
  hasOption: false,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  category: null,
  options: [],
});

const list = (qs = '') => GET(new Request(`http://localhost/api/v2/qrshop/products${qs}`));
const remove = () =>
  DELETE(new Request('http://localhost/api', { method: 'DELETE' }), {
    params: { onsiteProductId: 'p1' },
  });

beforeEach(() => {
  vi.resetAllMocks();
  context.mockResolvedValue({ ok: true, userId: 'u1', store: STORE });
  soldIds.mockResolvedValue(new Set());
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
});

describe('GET /api/v2/qrshop/products', () => {
  it('로그인하지 않았으면 401', async () => {
    context.mockResolvedValue({ ok: false, reason: 'UNAUTHORIZED' });
    expect((await list()).status).toBe(401);
  });

  it('상점이 없으면 빈 목록과 totalCount 0', async () => {
    context.mockResolvedValue({ ok: true, userId: 'u1', store: null });
    const body = await (await list()).json();
    expect(body.data).toMatchObject({ products: [], total: 0, totalCount: 0, hasNext: false });
    expect(product.findMany).not.toHaveBeenCalled();
  });

  it('기본은 1페이지 20개, 최신순(productId 보조 정렬)으로 조회한다', async () => {
    product.findMany.mockResolvedValue([row('p1')]);
    product.count.mockResolvedValue(1);

    const res = await list();
    expect(res.status).toBe(200);
    expect(product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: 's1' },
        orderBy: [{ createdAt: 'desc' }, { productId: 'desc' }],
        skip: 0,
        take: 20,
      }),
    );
  });

  it('page=2 는 앞의 20개를 건너뛰고, 다음 페이지가 있으면 hasNext=true', async () => {
    product.findMany.mockResolvedValue([row('p1')]);
    product.count.mockResolvedValue(45);

    const body = await (await list('?page=2')).json();
    expect(product.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    expect(body.data).toMatchObject({ page: 2, pageSize: 20, total: 45, hasNext: true });
  });

  it('마지막 페이지는 hasNext=false', async () => {
    product.findMany.mockResolvedValue([row('p1')]);
    product.count.mockResolvedValue(40);
    expect((await (await list('?page=2')).json()).data.hasNext).toBe(false);
  });

  it('검색어·카테고리는 where 에 걸리지만 totalCount 는 상점 전체 수다', async () => {
    product.findMany.mockResolvedValue([]);
    product.count.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      'name' in where ? 0 : 7,
    );

    const body = await (await list('?q=가방&categoryId=c1')).json();
    expect(product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: 's1', categoryId: 'c1', name: { contains: '가방', mode: 'insensitive' } },
      }),
    );
    // 검색 결과 없음(total=0)과 등록 상품 없음(totalCount=0)을 구분할 수 있다.
    expect(body.data).toMatchObject({ products: [], total: 0, totalCount: 7 });
  });

  it('결제완료 주문에 팔린 상품만 hasSalesHistory=true', async () => {
    product.findMany.mockResolvedValue([row('p1'), row('p2')]);
    product.count.mockResolvedValue(2);
    soldIds.mockResolvedValue(new Set(['p2']));

    const { products } = (await (await list()).json()).data;
    expect(soldIds).toHaveBeenCalledWith(['p1', 'p2']);
    expect(
      products.map((p: { id: string; hasSalesHistory: boolean }) => [p.id, p.hasSalesHistory]),
    ).toEqual([
      ['p1', false],
      ['p2', true],
    ]);
  });
});

describe('DELETE /api/v2/qrshop/products/{onsiteProductId}', () => {
  it('로그인하지 않았으면 401', async () => {
    context.mockResolvedValue({ ok: false, reason: 'UNAUTHORIZED' });
    expect((await remove()).status).toBe(401);
  });

  it('상점이 없으면 404', async () => {
    context.mockResolvedValue({ ok: true, userId: 'u1', store: null });
    expect((await remove()).status).toBe(404);
  });

  it('내 상점 상품이 아니면 404 이고 삭제하지 않는다', async () => {
    product.findFirst.mockResolvedValue(null);
    expect((await remove()).status).toBe(404);
    expect(product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'p1', storeId: 's1' } }),
    );
    expect(product.delete).not.toHaveBeenCalled();
  });

  it('판매이력이 있으면 409 PRODUCT_HAS_SALES 이고 삭제하지 않는다', async () => {
    product.findFirst.mockResolvedValue({ productId: 'p1', hasOption: false });
    paidSale.mockResolvedValue(true);

    const res = await remove();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('PRODUCT_HAS_SALES');
    expect(product.delete).not.toHaveBeenCalled();
  });

  it('판매이력이 없으면 삭제하고 productId 를 돌려준다', async () => {
    product.findFirst.mockResolvedValue({ productId: 'p1', hasOption: false });
    paidSale.mockResolvedValue(false);
    product.delete.mockResolvedValue({});

    const res = await remove();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'success', data: { productId: 'p1' } });
    expect(product.delete).toHaveBeenCalledWith({ where: { productId: 'p1' } });
  });
});
