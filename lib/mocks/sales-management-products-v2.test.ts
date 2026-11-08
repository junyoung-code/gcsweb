import { describe, expect, it } from 'vitest';
import { createMockLandingV2Service } from './sales-management-landing-v2-service';
import type { ProductFormInput } from '@/types/sales-management';

const input: ProductFormInput = { storeId: 'landing-store', name: '신상품', category: '', usesOptions: false, options: [], price: 0, stock: 0 };

describe('상품 관리 v2 공유 서비스', () => {
  it('등록·수정·삭제를 랜딩과 목록에 반영하고 수정 순서를 유지한다', async () => {
    const service = createMockLandingV2Service('success', { catalog: true, productCount: 2 });
    const product = await service.saveProduct({ ...input, price: 1000, usesOptions: true, options: [{ name: '대형', price: 300, stock: 2 }, { name: '소형', price: 0, stock: 3 }] });
    expect(product).toMatchObject({ price: 1000, stock: 5 });
    expect((await service.getSellerSummary()).recentProducts[0]).toEqual(product);
    const initial = await service.getProducts();
    expect(initial.total).toBe(3); expect(initial.newestProductId).toBe(product.id);
    const older = initial.items[1];
    await service.saveProduct({ ...input, name: '수정한 상품' }, older.id);
    const edited = await service.getProducts();
    expect(edited.items.map(item => item.id)).toEqual(initial.items.map(item => item.id));
    expect(edited.total).toBe(3);
    await service.deleteProduct(product.id);
    expect((await service.getProducts()).newestProductId).toBeNull();
    expect((await service.getSellerSummary()).productCount).toBe(2);
  });
  it('잘못된 저장과 삭제는 기존 데이터를 바꾸지 않는다', async () => {
    const service = createMockLandingV2Service('success', { productCount: 1 });
    const before = await service.getProducts();
    for (const patch of [{ price: -1 }, { stock: 1.5 }, { name: '' }, { usesOptions: true, options: [] }, { price: Number.MAX_SAFE_INTEGER + 1 }]) {
      await expect(service.saveProduct({ ...input, ...patch })).rejects.toThrow();
    }
    await expect(service.deleteProduct('missing')).rejects.toThrow();
    expect(await service.getProducts()).toEqual(before);
  });
  it('카테고리를 공백 제거·중복 방지하고 서비스 인스턴스끼리 데이터를 격리한다', async () => {
    const first = createMockLandingV2Service('store-only');
    const second = createMockLandingV2Service('store-only');
    await first.createCategory('  액세서리  '); await first.createCategory('액세서리');
    expect((await first.getCategories()).filter(name => name === '액세서리')).toHaveLength(1);
    await first.saveProduct(input);
    const result = await first.getProducts(); result.items[0].name = '외부 변경';
    expect((await first.getProducts()).items[0].name).toBe('신상품');
    expect((await second.getProducts()).total).toBe(0);
  });
  it('카테고리 8자 제한을 생성과 상품 저장 모두에서 검증한다', async () => {
    const service = createMockLandingV2Service('store-only');
    await expect(service.createCategory('일이삼사오육칠팔')).resolves.toBe('일이삼사오육칠팔');
    await expect(service.createCategory('일이삼사오육칠팔구')).rejects.toThrow();
    await expect(service.saveProduct({ ...input, category: '일이삼사오육칠팔구' })).rejects.toThrow();
  });

});
