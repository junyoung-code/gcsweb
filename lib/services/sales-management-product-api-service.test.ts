import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductFormInput } from '@/types/sales-management';
import { createStoreApiService } from './sales-management-store-api-service';

const fetcher = vi.fn();
const store = { storeId: 'store-db', name: '가게', storeSlug: 'abcd', storeUrl: '/QRshop/@abcd' };
const product = {
  id: 'product-db', name: '가방', imageUrl: '/api/v1/images/image-db', category: { id: 'cat-db', name: '가방류' },
  price: 1000, totalStock: 5, usesOptions: true, hasSalesHistory: true,
  options: [{ id: 'option-db', name: '빨강', surcharge: 200, stock: 5 }],
};
const input: ProductFormInput = { storeId: 'store-db', name: ' 가방 ', category: '가방류', price: 1000, stock: 5, usesOptions: true, options: [{ name: ' 빨강 ', price: 200, stock: 5 }] };
function respond(data: unknown) {
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success', data })));
}
async function ready() {
  const service = createStoreApiService(); respond(store); await service.getStore(); fetcher.mockClear(); return service;
}
beforeEach(() => { fetcher.mockReset(); vi.stubGlobal('fetch', fetcher); });
afterEach(() => vi.unstubAllGlobals());

describe('upstream 판매자 상품 API 계약', () => {
  it('모든 페이지를 읽고 기본가·추가금·재고·판매 이력을 매핑한다', async () => {
    const service = await ready();
    respond({ products: [product], total: 2, hasNext: true });
    respond({ products: [{ ...product, id: 'second', usesOptions: false }], total: 2, hasNext: false });
    const result = await service.getProducts();
    expect(result).toMatchObject({ total: 2, newestProductId: null, items: [
      { id: 'product-db', storeId: 'store-db', price: 1000, stock: 5, category: '가방류', hasSalesHistory: true, options: [{ id: 'option-db', price: 200, stock: 5 }] },
      { id: 'second', options: [] },
    ] });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/v2/qrshop/products?page=1&pageSize=100', '/api/v2/qrshop/products?page=2&pageSize=100']);
  });
  it('상점 미등록은 빈 목록이며 서버 실패를 빈 목록으로 바꾸지 않는다', async () => {
    const service = createStoreApiService(); respond(null);
    expect(await service.getProducts()).toEqual({ items: [], total: 0, newestProductId: null });
    const other = await ready();
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await expect(other.getProducts()).rejects.toThrow('offline');
  });
  it('기존 카테고리 이름을 id로 등록하고 옵션은 surcharge로 전송한다', async () => {
    const service = await ready();
    respond({ categories: [{ id: 'cat-db', name: '가방류' }] }); expect(await service.getCategories()).toEqual(['가방류']);
    respond({ product: { ...product, hasSalesHistory: false } });
    expect(await service.saveProduct(input)).toMatchObject({ id: 'product-db', options: [{ price: 200 }] });
    expect(fetcher).toHaveBeenLastCalledWith('/api/v2/qrshop/products', expect.objectContaining({ method: 'POST', body: JSON.stringify({
      name: '가방', price: 1000, categoryId: 'cat-db', hasOption: true, options: [{ name: '빨강', surcharge: 200, stock: 5 }],
    }) }));
    respond({ products: [], total: 0, hasNext: false }); expect((await service.getProducts()).newestProductId).toBe('product-db');
  });
  it('새 카테고리를 생성하고 수정에 id를 쓰며 해제·옵션 제거는 null/[]로 보낸다', async () => {
    const service = await ready();
    respond({ category: { id: 'cat-db', name: '가방류' } });
    respond({ product }); await service.saveProduct(input, 'product-db');
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/v2/qrshop/categories', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '가방류' }) }));
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ categoryId: 'cat-db', hasOption: true });
    respond({ product: { ...product, usesOptions: false, category: null, imageUrl: null } });
    await service.saveProduct({ ...input, category: '', usesOptions: false }, 'product/db');
    expect(fetcher).toHaveBeenLastCalledWith('/api/v2/qrshop/products/product%2Fdb', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({
      name: '가방', price: 1000, imageUrl: null, categoryId: null, hasOption: false, totalStock: 5, options: [],
    }) }));
  });
  it('선택한 카테고리는 재생성하지 않고 새 카테고리의 서버 id를 보관한다', async () => {
    const service = await ready();
    respond({ categories: [{ id: 'cat-db', name: '가방류' }] }); await service.getCategories();
    expect(await service.createCategory(' 가방류 ')).toBe('가방류'); expect(fetcher).toHaveBeenCalledTimes(1);
    respond({ category: { id: 'cat-new', name: '신발' } }); expect(await service.createCategory(' 신발 ')).toBe('신발');
    respond({ product }); await service.saveProduct({ ...input, category: '신발' }, 'product-db');
    expect(JSON.parse(fetcher.mock.lastCall![1].body)).toMatchObject({ categoryId: 'cat-new' });
  });
  it.each([[401, 'UNAUTHORIZED'], [404, 'NOT_FOUND'], [409, 'PRODUCT_HAS_SALES'], [400, 'INVALID_INPUT']])('%i %s 오류를 유지하고 Mock으로 바꾸지 않는다', async (status, code) => {
    const service = await ready();
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'error', code, message: '서버 거절' }), { status }));
    await expect(service.deleteProduct('product-db')).rejects.toMatchObject({ code, status });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('삭제 후 집계와 최근 상품을 새로 조회한다', async () => {
    const service = await ready();
    respond({ productId: 'product-db' });
    respond({ store: { id: 'store-db' }, productCount: 1, todayRevenue: 1000, todayOrderCount: 1 }); respond(store);
    respond({ products: [product], total: 1, hasNext: false });
    expect(await service.deleteProduct('remove-db')).toMatchObject({ productCount: 1, recentProducts: [{ id: 'product-db', hasSalesHistory: true }] });
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/v2/qrshop/products/remove-db', expect.objectContaining({ method: 'DELETE' }));
  });
  it('이미지는 ONSITE_PRODUCT multipart로 업로드하고 서버 URL만 반환한다', async () => {
    const service = createStoreApiService();
    const file = new File(['image'], 'sample.webp', { type: 'image/webp' });
    respond({ imageUrl: '/api/v1/images/uploaded' });
    expect(await service.uploadProductImage(file)).toBe('/api/v1/images/uploaded');
    const [url, init] = fetcher.mock.lastCall!;
    expect(url).toBe('/api/v1/images'); expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(init.headers).toBeUndefined(); expect(init.body.get('usage')).toBe('ONSITE_PRODUCT'); expect(init.body.get('image')).toBe(file);
  });
  it.each([['sample.png', 'image/png', 10 * 1024 * 1024 + 1], ['sample.gif', 'image/gif', 1], ['sample', 'image/png', 1], ['sample.png', 'image/png', 0]])('잘못된 업로드 %s/%s/%i는 요청하지 않는다', async (name, type, size) => {
    const file = new File(['x'], name, { type }); Object.defineProperty(file, 'size', { value: size });
    await expect(createStoreApiService().uploadProductImage(file)).rejects.toThrow('10MB'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('업로드 실패를 로컬 data URL 성공으로 바꾸지 않는다', async () => {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'error', code: 'FILE_TOO_LARGE', message: '용량 초과' }), { status: 413 }));
    await expect(createStoreApiService().uploadProductImage(new File(['x'], 'sample.png', { type: 'image/png' }))).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', status: 413 });
  });
});
