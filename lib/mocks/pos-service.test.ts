import { describe, expect, it, vi } from 'vitest';
import { createPosLine } from '@/lib/services/pos-service';
import type { SalesProduct } from '@/types/sales-management';
import { createMockPosService } from './pos-service';

function setup() {
  const products: SalesProduct[] = [
    { id: 'postcard', storeId: 'store', name: '부산 엽서', category: '엽서', price: 3000, stock: 2, options: [], isVisible: true, hasSalesHistory: false },
    { id: 'keyring', storeId: 'store', name: '고양이 키링', category: '키링', price: 5000, stock: 3,
      options: [{ id: 'black', name: '검정', price: 1000, stock: 2 }, { id: 'white', name: '흰색', price: 0, stock: 1 }], isVisible: true, hasSalesHistory: false },
    { id: 'hidden', storeId: 'store', name: '미노출', category: '', price: 100, stock: 1, options: [], isVisible: false, hasSalesHistory: false },
  ];
  const source = { getProducts: vi.fn(async () => ({ items: products, total: products.length, newestProductId: null })) };
  return { products, source, service: createMockPosService(source) };
}

describe('POS Mock 서비스', () => {
  it('노출 catalog를 재사용하며 중복 행을 합치고 옵션 추가금을 재계산한다', async () => {
    const { service, products } = setup();
    expect(await service.getCatalog()).toHaveLength(2);
    const line = { ...createPosLine(products[1], 'black'), unitPrice: 1 };
    const receipt = await service.completeSale([line, line], 'card');
    expect(receipt).toMatchObject({ orderCode: '001', totalAmount: 12000, paymentMethod: 'card', lines: [{ quantity: 2, unitPrice: 6000, option: '검정' }] });
    const catalog = await service.getCatalog();
    expect(catalog[1]).toMatchObject({ stock: 1, options: [{ stock: 0 }, { stock: 1 }] });
    expect(products[1].stock).toBe(3);
    await expect(service.completeSale([line], 'cash')).rejects.toThrow('판매할 수 없는 상품');
    expect((await service.completeSale([createPosLine(products[1], 'white')], 'transfer')).totalAmount).toBe(5000);
    expect((await service.getCatalog())[1].stock).toBe(0);
  });

  it('같은 재고에 대한 동시 요청 중 가능한 한 건만 처리한다', async () => {
    const { service, products } = setup();
    const line = { ...createPosLine(products[0]), quantity: 2 };
    const results = await Promise.allSettled([service.completeSale([line], 'cash'), service.completeSale([line], 'cash')]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((await service.getCatalog())[0].stock).toBe(0);
  });

  it('옵션별 재고뿐 아니라 상품 총재고도 초과하지 않는다', async () => {
    const { service, products } = setup();
    products[1].stock = 1;
    await expect(service.completeSale([createPosLine(products[1], 'black'), createPosLine(products[1], 'white')], 'cash')).rejects.toThrow('남은 재고수');
    expect((await service.getCatalog())[1].stock).toBe(1);
  });

  it('빈 주문·잘못된 수량·옵션·미노출 상품·결제수단을 거절하고 재고를 유지한다', async () => {
    const { service, products } = setup();
    const plain = createPosLine(products[0]);
    for (const lines of [[], [{ ...plain, quantity: 0 }], [{ ...plain, quantity: 1.5 }], [{ ...plain, quantity: 3 }],
      [{ ...plain, optionId: 'missing' }], [createPosLine(products[1])], [createPosLine(products[2])]]) {
      await expect(service.completeSale(lines, 'card')).rejects.toThrow();
    }
    // Exercise the runtime boundary even though the UI exposes only the three valid choices.
    await expect(service.completeSale([plain], 'online' as 'card')).rejects.toThrow('결제수단');
    expect((await service.getCatalog())[0].stock).toBe(2);
  });

  it('catalog 오류 후 재시도할 수 있고 결제 검증 전 실패는 재고를 차감하지 않는다', async () => {
    const { service, source, products } = setup();
    source.getProducts.mockRejectedValueOnce(new Error('조회 실패'));
    await expect(service.completeSale([createPosLine(products[0])], 'card')).rejects.toThrow('조회 실패');
    expect((await service.getCatalog())[0].stock).toBe(2);
  });
});

describe('POS 노출 설정 경계', () => {
  it('설정은 복사본이며 숨김/제거/추가는 공용 visibility를 바꾸지 않고 판매 가능 상품에 반영한다', async () => {
    const { service, products } = setup();
    const draft = await service.getExposure();
    draft.find(group => group.category === '엽서')!.hidden = true;
    draft.find(group => group.category === '')!.productIds.push('hidden');
    expect((await service.getCatalog()).map(product => product.id)).toEqual(['postcard', 'keyring']);
    await service.saveExposure(draft);
    draft.find(group => group.category === '')!.productIds.length = 0;
    expect((await service.getCatalog()).map(product => product.id)).toEqual(['keyring', 'hidden']);
    expect(products[2].isVisible).toBe(false);
    await expect(service.completeSale([createPosLine(products[0])], 'cash')).rejects.toThrow('판매할 수 없는 상품');
    expect((await service.completeSale([createPosLine(products[2])], 'cash')).totalAmount).toBe(100);
  });

  it('중복/잘못된 카테고리 저장은 거부하고 삭제/카테고리 변경과 미분류 하단을 정합화한다', async () => {
    const { service, products } = setup();
    const saved = await service.getExposure();
    const duplicate = saved.map(group => ({ ...group, productIds: [...group.productIds] }));
    duplicate[0].productIds.push('postcard');
    await expect(service.saveExposure(duplicate)).rejects.toThrow('다시 확인');
    const wrongCategory = saved.map(group => ({ ...group, productIds: [...group.productIds] }));
    wrongCategory[0].productIds.push('hidden');
    await expect(service.saveExposure(wrongCategory)).rejects.toThrow('다시 확인');
    expect((await service.getCatalog()).map(product => product.id)).toEqual(['postcard', 'keyring']);
    products[0].category = '';
    products.splice(1, 1);
    const reconciled = await service.getExposure();
    expect(reconciled.at(-1)).toMatchObject({ category: '', productIds: ['postcard'] });
    expect(reconciled.flatMap(group => group.productIds)).not.toContain('keyring');
    await expect(service.saveExposure(saved)).rejects.toThrow('다시 확인');
    expect((await service.getCatalog()).map(product => product.id)).toEqual(['postcard']);
  });
});
