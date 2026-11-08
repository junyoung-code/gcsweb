import { describe, expect, it } from 'vitest';
import { MockServiceError } from './mock-service';
import {
  createMockSalesManagementLandingService,
  createSalesManagementMockService,
} from './sales-management-service';

describe('createMockSalesManagementLandingService', () => {
  it('정상 상태에서는 등록 상점 요약을 반환한다', async () => {
    const service = createMockSalesManagementLandingService();

    await expect(service.getSellerSummary()).resolves.toEqual(
      expect.objectContaining({
        store: expect.objectContaining({ name: '잇장샵' }),
        productCount: 0,
      }),
    );
  });

  it('빈 상태에서는 상점이 없는 요약을 같은 계약으로 반환한다', async () => {
    const service = createMockSalesManagementLandingService('empty');

    await expect(service.getSellerSummary()).resolves.toEqual({
      store: null,
      productCount: 0,
      orderCount: 0,
      lowStockCount: 0,
    });
  });

  it('오류 상태에서는 공통 Mock Service 오류를 반환한다', async () => {
    const service = createMockSalesManagementLandingService('error');

    await expect(service.getSellerSummary()).rejects.toBeInstanceOf(MockServiceError);
  });
});

describe('salesManagementMockService', () => {
  it('사용 가능한 상점 아이디를 확인하고 등록 결과를 돌려준다', async () => {
    const service = createSalesManagementMockService();

    await expect(service.checkStoreIdentifier('paper-shop')).resolves.toBe(true);
    await expect(
      service.saveStore({ name: '종이 상점', storeIdentifier: 'paper-shop' }),
    ).resolves.toMatchObject({
      id: 'store-paper-shop',
      name: '종이 상점',
      visitorOrderUrl: '/QRshop?store=paper-shop',
    });
  });

  it('예약된 상점 아이디는 사용할 수 없다고 알려준다', async () => {
    const service = createSalesManagementMockService();

    await expect(service.checkStoreIdentifier('taken-shop')).resolves.toBe(false);
  });

  it('상점 식별자를 포함한 상품을 저장하고 목록에서 반환한다', async () => {
    const service = createSalesManagementMockService();
    const store = await service.getStore();
    const product = await service.saveProduct({
      storeId: store!.id,
      name: '손목시계',
      category: '시계',
      usesOptions: false,
      options: [],
      price: 30000,
      stock: 20,
    });

    expect(product.storeId).toBe(store!.id);
    await expect(service.getProducts()).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ name: '손목시계' })],
    });
  });
});
