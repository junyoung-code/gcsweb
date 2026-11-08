import { describe, expect, it } from 'vitest';
import { createMockLandingV2Service } from './sales-management-landing-v2-service';

const productInput = { storeId: 'landing-store', name: '상품 수정', category: '', usesOptions: false, options: [], price: 0, stock: 0 };

describe('v2 판매 이력과 상점 서비스', () => {
  it('판매 상품을 재고 0으로 수정해도 이력을 유지하고 직접 삭제를 거절한다', async () => {
    const service = createMockLandingV2Service();
    const sold = (await service.getProducts()).items.find(item => item.hasSalesHistory)!;
    expect(await service.saveProduct(productInput, sold.id)).toMatchObject({ hasSalesHistory: true, stock: 0 });
    const before = await service.getSellerSummary();
    await expect(service.deleteProduct(sold.id)).rejects.toThrow('판매 이력');
    await expect(service.deleteStore()).rejects.toThrow('판매 이력');
    expect(await service.getSellerSummary()).toEqual(before);
    expect(await service.saveProduct(productInput)).toMatchObject({ hasSalesHistory: false });
  });
  it('상점 수정은 내부 ID와 이력을 유지하고 본인 아이디를 허용한다', async () => {
    const service = createMockLandingV2Service();
    const store = (await service.getStore())!;
    expect(store.visitorOrderUrl).toBe('https://www.gcsweb.kr/QRshop?store=ybbybby0308');
    expect(await service.checkStoreIdentifier(store.storeIdentifier)).toBe(true);
    const saved = await service.saveStore({ name: '변경된 상점', storeIdentifier: 'newshop123' });
    expect(saved).toMatchObject({ id: store.id, hasSalesHistory: true, name: '변경된 상점' });
    expect((await service.getSellerSummary()).store).toEqual(saved);
    expect(await service.getVisitorOrderQr()).toMatchObject({ isMock: true, visitorOrderUrl: 'https://www.gcsweb.kr/QRshop?store=newshop123' });
    const snapshot = await service.getStore(); snapshot!.hasSalesHistory = false;
    await expect(service.deleteStore()).rejects.toThrow('판매 이력');
  });
  it('판매 이력이 없으면 등록 상품이 있어도 상점과 상품·최근 상품·NEW 상태를 정리한다', async () => {
    const service = createMockLandingV2Service('no-sales');
    await service.saveProduct(productInput);
    await service.deleteStore();
    expect(await service.getStore()).toBeNull();
    expect(await service.getProducts()).toEqual({ items: [], total: 0, newestProductId: null });
    expect(await service.getSellerSummary()).toMatchObject({ store: null, productCount: 0, recentProducts: [], todayRevenue: 0, todaySalesCount: 0 });
    await expect(service.getVisitorOrderQr()).rejects.toThrow();
    await expect(service.saveProduct(productInput)).rejects.toThrow();
    const recreated = await service.saveStore({ name: '새 상점', storeIdentifier: 'shop1234' });
    expect(recreated.hasSalesHistory).toBe(false);
    expect((await service.getProducts()).total).toBe(0);
  });
  it('4~20자 소문자·숫자를 검증하고 중복과 무효 저장은 상태를 보존한다', async () => {
    const service = createMockLandingV2Service('empty');
    for (const identifier of ['abc', 'shop-123', 'SHOP123', 'a'.repeat(21), 'taken123']) {
      expect(await service.checkStoreIdentifier(identifier)).toBe(false);
      await expect(service.saveStore({ name: '상점 이름', storeIdentifier: identifier })).rejects.toThrow();
      expect(await service.getStore()).toBeNull();
    }
    for (const identifier of ['a123', 'a'.repeat(20)]) {
      expect(await service.checkStoreIdentifier(identifier)).toBe(true);
      expect(await service.saveStore({ name: '상점 이름', storeIdentifier: identifier })).toMatchObject({ storeIdentifier: identifier, hasSalesHistory: false });
    }
  });
});
