// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
  prisma: { store: { findUnique: vi.fn() } },
}));

type Fn = ReturnType<typeof vi.fn>;
const findStore = prisma.store.findUnique as unknown as Fn;

const option = (id: string, currentStock: number, surcharge = 0) => ({
  optionId: id,
  name: `옵션 ${id}`,
  surcharge,
  currentStock,
});

const product = (id: string, overrides: Record<string, unknown> = {}) => ({
  productId: id,
  name: `상품 ${id}`,
  price: 5000,
  imageUrl: null,
  categoryId: null,
  hasOption: false,
  currentStock: 3,
  options: [],
  ...overrides,
});

const storeRow = (products: unknown[] = [], categories: unknown[] = []) => ({
  storeId: 's1',
  name: '열반급행',
  storeSlug: 'nirvanaexpress',
  categories,
  products,
});

const get = (qs: string) => GET(new Request(`http://localhost/api/v2/qrshop${qs}`));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/v2/qrshop', () => {
  it('storeSlug가 없으면 400', async () => {
    const res = await get('');
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_INPUT');
    expect(findStore).not.toHaveBeenCalled();
  });

  it('storeSlug 형식이 틀리면(@ 포함·대문자·4자 미만) 400', async () => {
    for (const slug of ['%40nirvanaexpress', 'Nirvana', 'abc']) {
      expect((await get(`?storeSlug=${slug}`)).status).toBe(400);
    }
    expect(findStore).not.toHaveBeenCalled();
  });

  it('없는 상점이면 404', async () => {
    findStore.mockResolvedValue(null);
    const res = await get('?storeSlug=nope1');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NOT_FOUND', message: '존재하지 않는 상점' });
  });

  it('상점·카테고리·상품을 명세 형태로 내려주고 상점 이미지와 재고 수량은 빼고 준다', async () => {
    findStore.mockResolvedValue(
      storeRow(
        [
          product('p2', {
            categoryId: 'c1',
            hasOption: true,
            currentStock: 2,
            options: [option('o1', 2, 1000), option('o2', 0)],
          }),
          product('p1'),
        ],
        [{ categoryId: 'c1', name: '키링' }],
      ),
    );

    const body = await (await get('?storeSlug=nirvanaexpress')).json();

    expect(body.status).toBe('success');
    expect(body.data.store).toEqual({ storeId: 's1', name: '열반급행', storeSlug: 'nirvanaexpress' });
    expect(body.data.categories).toEqual([{ categoryId: 'c1', name: '키링' }]);
    expect(body.data.products).toEqual([
      {
        productId: 'p2',
        name: '상품 p2',
        price: 5000,
        imageUrl: null,
        categoryId: 'c1',
        hasOption: true,
        soldOut: false,
        options: [
          { optionId: 'o1', name: '옵션 o1', surcharge: 1000, soldOut: false },
          { optionId: 'o2', name: '옵션 o2', surcharge: 0, soldOut: true },
        ],
      },
      {
        productId: 'p1',
        name: '상품 p1',
        price: 5000,
        imageUrl: null,
        categoryId: null,
        hasOption: false,
        soldOut: false,
        options: [],
      },
    ]);
  });

  it('옵션 없는 상품은 재고 0이면 품절', async () => {
    findStore.mockResolvedValue(storeRow([product('p1', { currentStock: 0 })]));
    const body = await (await get('?storeSlug=nirvanaexpress')).json();
    expect(body.data.products[0].soldOut).toBe(true);
  });

  it('옵션 상품은 모든 옵션이 품절일 때만 상품도 품절', async () => {
    findStore.mockResolvedValue(
      storeRow([
        product('p1', { hasOption: true, currentStock: 0, options: [option('o1', 0), option('o2', 0)] }),
        product('p2', { hasOption: true, currentStock: 1, options: [option('o3', 0), option('o4', 1)] }),
      ]),
    );
    const body = await (await get('?storeSlug=nirvanaexpress')).json();
    expect(body.data.products.map((p: { soldOut: boolean }) => p.soldOut)).toEqual([true, false]);
  });

  it('상품이 없으면 200과 빈 배열', async () => {
    findStore.mockResolvedValue(storeRow());
    const res = await get('?storeSlug=nirvanaexpress');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ categories: [], products: [] });
  });

  it('DB 쿼리: 상품 있는 카테고리만, 카테고리 등록순, 상품 최신순, 옵션 등록순(오래된 것이 위)', async () => {
    findStore.mockResolvedValue(storeRow());
    await get('?storeSlug=nirvanaexpress');

    const { where, select } = findStore.mock.calls[0][0];
    expect(where).toEqual({ storeSlug: 'nirvanaexpress' });
    expect(select.categories.where).toEqual({ products: { some: {} } });
    expect(select.categories.orderBy).toEqual({ createdAt: 'asc' });
    expect(select.products.orderBy).toEqual([{ createdAt: 'desc' }, { productId: 'desc' }]);
    expect(select.products.select.options.orderBy).toEqual([{ createdAt: 'asc' }, { optionId: 'asc' }]);
    expect(select.imageUrl).toBeUndefined();
  });

  it('DB 오류면 500', async () => {
    findStore.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await get('?storeSlug=nirvanaexpress')).status).toBe(500);
  });
});
