import { describe, expect, it } from 'vitest';
import {
  QRSHOP_EDGE_LONG_OPTION_NAME,
  QRSHOP_EDGE_LONG_PRODUCT_NAME,
  qrshopEdgeCaseProducts,
  qrshopProducts,
  qrshopQaProducts,
} from './qrshop-data';

describe('QRshop 예외 케이스 Mock 데이터', () => {
  it('이미지·옵션 누락과 긴 문자열 케이스를 포함한다', () => {
    expect(qrshopEdgeCaseProducts.some((product) => product.imageUrl === undefined)).toBe(true);
    expect(qrshopEdgeCaseProducts.some((product) => product.option === undefined)).toBe(true);
    expect(QRSHOP_EDGE_LONG_PRODUCT_NAME).toHaveLength(20);
    expect(QRSHOP_EDGE_LONG_OPTION_NAME).toHaveLength(15);
    expect(qrshopEdgeCaseProducts.some((product) => product.name === QRSHOP_EDGE_LONG_PRODUCT_NAME)).toBe(true);
    expect(qrshopEdgeCaseProducts.some((product) => product.option === QRSHOP_EDGE_LONG_OPTION_NAME)).toBe(true);
  });

  it('옵션 6개 이상과 추가금 옵션 그룹을 포함한다', () => {
    const grouped = Map.groupBy(qrshopEdgeCaseProducts, (product) => `${product.categoryId}:${product.name}:${product.imageUrl ?? ''}`);
    expect([...grouped.values()].some((products) => products.length >= 6)).toBe(true);

    const surchargeProducts = qrshopEdgeCaseProducts.filter((product) => product.name === '추가금 확인 상품');
    const basePrice = Math.min(...surchargeProducts.map((product) => product.price));
    expect(surchargeProducts.map((product) => product.price - basePrice)).toEqual([0, 1_000, 2_500, 5_000]);
  });

  it('카테고리 탭이 넘칠 만큼 다양한 카테고리를 포함한다', () => {
    const categories = new Set(qrshopEdgeCaseProducts.map((product) => product.categoryId));
    expect(categories.size).toBeGreaterThanOrEqual(8);
  });

  it('QA 목록은 기존 상품 뒤에 예외 케이스 상품을 모두 포함한다', () => {
    expect(qrshopQaProducts).toEqual([...qrshopProducts, ...qrshopEdgeCaseProducts]);
  });
});
