import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: { orderItem: { findFirst: vi.fn(), findMany: vi.fn() } } }));

import { ORDER_PAYMENT_STATUS } from '@/lib/order-status';
import { findPaidSoldProductIds, hasProductPaidSale } from './sales-history';

const client = (found: boolean) => {
  const findFirst = vi.fn().mockResolvedValue(found ? { id: 'oi1' } : null);
  return { client: { orderItem: { findFirst } } as never, findFirst };
};

const listClient = (lines: Array<{ onsiteProductId: string | null }>) => {
  const findMany = vi.fn().mockResolvedValue(lines);
  return { client: { orderItem: { findMany } } as never, findMany };
};

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

describe('findPaidSoldProductIds', () => {
  it('상품이 없으면 질의하지 않는다', async () => {
    const { client: c, findMany } = listClient([]);
    expect(await findPaidSoldProductIds([], c)).toEqual(new Set());
    expect(findMany).not.toHaveBeenCalled();
  });

  it('결제완료 주문에 팔린 상품 id만 집합으로 돌려준다(null 제외)', async () => {
    const { client: c, findMany } = listClient([{ onsiteProductId: 'p2' }, { onsiteProductId: null }]);
    expect(await findPaidSoldProductIds(['p1', 'p2'], c)).toEqual(new Set(['p2']));
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { onsiteProductId: { in: ['p1', 'p2'] }, order: { paymentStatus: ORDER_PAYMENT_STATUS.PAID } },
      distinct: ['onsiteProductId'],
    });
  });
});
