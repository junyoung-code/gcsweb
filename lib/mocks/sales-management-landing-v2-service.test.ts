import { describe, expect, it } from 'vitest';
import { createMockLandingV2Service } from './sales-management-landing-v2-service';

describe('판매관리 v2 Mock Service', () => {
  it('삭제 후 최근 상품을 보충하며 다른 세션과 데이터를 공유하지 않는다', async () => {
    const service = createMockLandingV2Service();
    const initial = await service.getSellerSummary();
    const next = await service.deleteProduct(initial.recentProducts[0].id);
    expect(next.productCount).toBe(35);
    expect(next.recentProducts.map(product => product.id)).toEqual([
      'landing-product-2', 'landing-product-3', 'landing-product-4', 'landing-product-5', 'landing-product-6', 'landing-product-7',
    ]);
    expect((await createMockLandingV2Service().getSellerSummary()).productCount).toBe(36);
    await expect(service.deleteProduct('missing')).rejects.toThrow('상품을 찾을 수 없어요.');
    expect((await service.getSellerSummary()).productCount).toBe(35);
  });
  it('상점 미등록 시 QR 발급과 이미지 등록을 막는다', async () => {
    const service = createMockLandingV2Service('empty');
    await expect(service.getVisitorOrderQr()).rejects.toThrow('상점 등록 후');
    await expect(service.updateStoreImage(new File([], 'shop.png', { type: 'image/png' }))).rejects.toThrow('상점 등록 후');
  });
  it('잘못된 파일을 거부하고 기존 프로필을 유지한다', async () => {
    const service = createMockLandingV2Service();
    const before = await service.getSellerSummary();
    await expect(service.updateStoreImage(new File(['text'], 'text.txt', { type: 'text/plain' }))).rejects.toThrow('이미지 파일');
    expect((await service.getSellerSummary()).store).toEqual(before.store);
  });
});
