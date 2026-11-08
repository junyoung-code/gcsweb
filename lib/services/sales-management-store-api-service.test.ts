import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStoreApiService } from './sales-management-store-api-service';

const store = { storeId: 'db-id', name: '가게', storeSlug: 'abcd', storeUrl: 'https://example.com/QRshop/@abcd', hasSalesHistory: true };
const fetcher = vi.fn();
const success = (data: unknown) => ({ status: 'success', data });
function respond(body: unknown, status = 200) {
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}
beforeEach(() => { fetcher.mockReset(); vi.stubGlobal('fetch', fetcher); });
afterEach(() => vi.unstubAllGlobals());

describe('upstream v2 상점 API 계약', () => {
  it('미등록은 null이며 기본 키·slug·URL·판매 이력을 매핑한다', async () => {
    const service = createStoreApiService();
    respond(success(null)); expect(await service.getStore()).toBeNull();
    respond(success(store));
    expect(await service.getStore()).toEqual({ id: 'db-id', name: '가게', storeIdentifier: 'abcd', visitorOrderUrl: store.storeUrl, hasSalesHistory: true });
    expect(fetcher).toHaveBeenLastCalledWith('/api/v2/qrshop/stores/me', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }));
  });
  it('중복 검사는 storeSlug query를 보내고 본인 아이디는 그대로 사용할 수 있다', async () => {
    const service = createStoreApiService();
    respond(success(store)); await service.getStore();
    expect(await service.checkStoreIdentifier('abcd')).toBe(true);
    respond(success({ available: false })); expect(await service.checkStoreIdentifier('taken123')).toBe(false);
    expect(fetcher).toHaveBeenLastCalledWith('/api/v2/qrshop/stores/check-id?storeSlug=taken123', expect.anything());
  });
  it('등록은 POST, 수정은 storeId PATCH이고 새 QR은 서버의 URL과 SVG를 쓴다', async () => {
    const service = createStoreApiService();
    respond(success(null)); await service.getStore();
    respond(success({ ...store, hasSalesHistory: undefined }));
    await service.saveStore({ name: ' 가게 ', storeIdentifier: 'abcd' });
    expect(fetcher).toHaveBeenLastCalledWith('/api/v2/qrshop/stores', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '가게', storeSlug: 'abcd' }) }));
    respond(success({ storeUrl: store.storeUrl, svg: '<svg>old</svg>' })); await service.getVisitorOrderQr();
    const updated = { ...store, storeSlug: 'nextshop', storeUrl: 'https://example.com/QRshop/@nextshop', urlReissued: true };
    respond(success(updated));
    expect(await service.saveStore({ name: '가게', storeIdentifier: 'nextshop' })).toMatchObject({ id: 'db-id', visitorOrderUrl: updated.storeUrl });
    expect(fetcher).toHaveBeenLastCalledWith('/api/v2/qrshop/stores/db-id', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: '가게', storeSlug: 'nextshop' }) }));
    respond(success({ storeUrl: updated.storeUrl, svg: '<svg>new</svg>' }));
    expect(await service.getVisitorOrderQr()).toEqual({ visitorOrderUrl: updated.storeUrl, imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg>new</svg>')}` });
    expect(fetcher).toHaveBeenLastCalledWith('/api/v2/qrshop/stores/db-id/qrcode', expect.anything());
  });
  it('수정이 판매 이력을 지우지 않고 삭제 409 이후에도 기존 상점을 유지한다', async () => {
    const service = createStoreApiService();
    respond(success(store)); await service.getStore();
    respond(success({ ...store, hasSalesHistory: undefined, urlReissued: false }));
    expect(await service.saveStore({ name: '가게', storeIdentifier: 'abcd' })).toMatchObject({ hasSalesHistory: true });
    respond({ status: 'error', code: 'STORE_HAS_SALES' }, 409);
    await expect(service.deleteStore()).rejects.toMatchObject({ code: 'STORE_HAS_SALES', message: '판매 이력이 있는 상점은 삭제할 수 없어요.' });
    respond(success({ storeId: 'db-id' })); await service.deleteStore();
    expect(fetcher).toHaveBeenLastCalledWith('/api/v2/qrshop/stores/db-id', expect.objectContaining({ method: 'DELETE' }));
    await expect(service.getVisitorOrderQr()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it.each([[401, 'UNAUTHORIZED'], [404, 'NOT_FOUND'], [409, 'STORE_SLUG_TAKEN'], [409, 'STORE_ALREADY_EXISTS'], [500, 'SERVER_ERROR']])('HTTP %i %s는 Mock 성공으로 바꾸지 않는다', async (status, code) => {
    respond({ status: 'error', code }, status as number);
    await expect(createStoreApiService().getStore()).rejects.toMatchObject({ code, status });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('네트워크·비JSON 오류를 성공으로 바꾸지 않는다', async () => {
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await expect(createStoreApiService().getStore()).rejects.toThrow('offline');
    fetcher.mockResolvedValueOnce(new Response('<html>', { status: 404 }));
    await expect(createStoreApiService().getStore()).rejects.toMatchObject({ code: 'SERVER_ERROR', status: 404 });
  });
  it('summary 당일 집계와 별도 판매자 최근 상품 조회를 사용한다', async () => {
    const service = createStoreApiService();
    respond(success({ store: { id: 'db-id' }, productCount: 3, todayRevenue: 10000, todayOrderCount: 2 }));
    respond(success(store));
    respond(success({ products: [], total: 3, hasNext: false }));
    expect(await service.getSellerSummary()).toMatchObject({ store: { id: 'db-id' }, productCount: 3, todayRevenue: 10000, todaySalesCount: 2, recentProducts: [] });
    expect(fetcher).toHaveBeenLastCalledWith('/api/v2/qrshop/products?page=1&pageSize=6', expect.anything());
    await expect(service.updateStoreImage({} as never)).rejects.toThrow('상점 이미지');
  });
});
