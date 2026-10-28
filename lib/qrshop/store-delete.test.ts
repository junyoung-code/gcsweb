import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('./sales-history', () => ({ hasStorePaidSale: vi.fn() }));

import { hasStorePaidSale } from './sales-history';
import { deleteStoreWithoutSales } from './store-delete';

const sales = hasStorePaidSale as unknown as ReturnType<typeof vi.fn>;

const tx = () => ({
  $queryRaw: vi.fn().mockResolvedValue([]),
  order: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
  store: { delete: vi.fn().mockResolvedValue({}) },
});

describe('deleteStoreWithoutSales', () => {
  it('판매이력이 있으면 아무것도 지우지 않는다', async () => {
    const t = tx();
    sales.mockResolvedValue(true);
    expect(await deleteStoreWithoutSales(t as never, 's1')).toBe('HAS_SALES');
    expect(t.order.deleteMany).not.toHaveBeenCalled();
    expect(t.store.delete).not.toHaveBeenCalled();
  });

  it('판매이력이 없으면 상점 행을 잠그고 미결제 주문과 상점을 지운다', async () => {
    const t = tx();
    sales.mockResolvedValue(false);
    expect(await deleteStoreWithoutSales(t as never, 's1')).toBe('DELETED');
    expect(t.$queryRaw).toHaveBeenCalledTimes(1);
    expect(t.order.deleteMany).toHaveBeenCalledWith({ where: { orderNumber: { storeId: 's1' } } });
    expect(t.store.delete).toHaveBeenCalledWith({ where: { storeId: 's1' } });
  });
});
