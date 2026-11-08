import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQrshopApiService } from './qrshop-api-service';

const catalog = {
  store: { storeId: 's1', name: '실제 상점', storeSlug: 'shop1234' },
  categories: [{ categoryId: 'c1', name: '의류' }],
  products: [
    { productId: 'p1', name: '같은 상품명', categoryId: 'c1', price: 5000, imageUrl: null, hasOption: true, soldOut: false, stock: null,
      options: [{ optionId: 'o1', name: 'S', surcharge: 1000, stock: 2, soldOut: false }, { optionId: 'o2', name: 'L', surcharge: 2000, stock: 3, soldOut: false }] },
    { productId: 'p2', name: '같은 상품명', categoryId: 'c1', price: 5000, imageUrl: null, hasOption: false, soldOut: false, stock: 4, options: [] },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('QRshop 카탈로그 API 어댑터', () => {
  it('상점 slug·카테고리·상품 식별자·옵션 추가금과 독립 재고를 매핑하고 매번 새로 조회한다', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success', data: catalog }) });
    vi.stubGlobal('fetch', fetcher);
    const service = createQrshopApiService('shop1234');
    const result = await service.getCatalog();
    expect(result).toMatchObject({ store: catalog.store, storeStatus: 'unknown', categories: [{ id: 'c1', name: '의류' }] });
    expect(result.items).toMatchObject([
      { id: 'p1:o1', sourceProductId: 'p1', optionId: 'o1', price: 6000, basePrice: 5000, stock: 2 },
      { id: 'p1:o2', sourceProductId: 'p1', optionId: 'o2', price: 7000, stock: 3 },
      { id: 'p2', sourceProductId: 'p2', price: 5000, stock: 4 },
    ]);
    expect(result.items.slice(0, 2).reduce((sum, item) => sum + item.stock!, 0)).toBe(5);
    await service.getCatalog({ refresh: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith('/api/v2/qrshop?storeSlug=shop1234', { cache: 'no-store' });
  });

  it('재조회 시 0 재고와 품절을 반영하고 API 실패를 그대로 전파한다', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'success', data: { ...catalog, products: [{ ...catalog.products[1], stock: 0, soldOut: true }] } }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ status: 'error', message: '존재하지 않는 상점' }) })
      .mockRejectedValueOnce(new Error('네트워크 오류')));
    const service = createQrshopApiService('shop1234');
    expect((await service.getCatalog({ refresh: true })).items[0]).toMatchObject({ stock: 0, soldOut: true });
    await expect(service.getCatalog()).rejects.toThrow('존재하지 않는 상점');
    await expect(service.getCatalog()).rejects.toThrow('네트워크 오류');
  });

  it('잘못된 상점은 요청하지 않고 주문·조회·결제는 Mock으로 대체하지 않는다', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const service = createQrshopApiService('@bad');
    await expect(service.getCatalog()).rejects.toThrow('유효하지 않은 상점');
    const draft = { lines: [], buyerName: '', buyerPhone: '', paymentMethod: 'online' as const };
    await expect(service.createOrder(draft)).rejects.toThrow('유효하지 않은 상점');
    await expect(service.getOrder('qr-existing-mock')).rejects.toThrow('유효하지 않은 상점');
    await expect(service.processPayment('qr-existing-mock', 'success')).rejects.toThrow('서버 검증');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
