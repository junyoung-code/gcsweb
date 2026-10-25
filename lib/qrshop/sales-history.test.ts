import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: { orderItem: { findFirst: vi.fn() } } }));

import { ORDER_PAYMENT_STATUS } from '@/lib/order-status';
import { hasProductPaidSale, hasStorePaidSale } from './sales-history';

const client = (found: boolean) => {
  const findFirst = vi.fn().mockResolvedValue(found ? { id: 'oi1' } : null);
  return { client: { orderItem: { findFirst } } as never, findFirst };
};

describe('hasStorePaidSale', () => {
  it('결제완료 주문의 상점 상품 항목이 있으면 true', async () => {
    const { client: c, findFirst } = client(true);
    expect(await hasStorePaidSale('s1', c)).toBe(true);
    expect(findFirst.mock.calls[0][0].where).toEqual({
      onsiteProduct: { storeId: 's1' },
      order: { paymentStatus: ORDER_PAYMENT_STATUS.PAID },
    });
  });

  it('없으면 false', async () => {
    expect(await hasStorePaidSale('s1', client(false).client)).toBe(false);
  });
});

describe('hasProductPaidSale', () => {
  it('상품 기준으로 결제완료 항목을 조회한다', async () => {
    const { client: c, findFirst } = client(true);
    expect(await hasProductPaidSale('p1', c)).toBe(true);
    expect(findFirst.mock.calls[0][0].where).toEqual({ onsiteProductId: 'p1', order: { paymentStatus: ORDER_PAYMENT_STATUS.PAID } });
  });

  it('없으면 false', async () => {
    expect(await hasProductPaidSale('p1', client(false).client)).toBe(false);
  });
});
