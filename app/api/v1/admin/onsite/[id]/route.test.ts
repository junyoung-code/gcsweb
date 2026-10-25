// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { ORDER_PAYMENT_METHOD, ORDER_PAYMENT_STATUS, ORDER_RECEIPT_STATUS } from '@/lib/order-status';
import { PATCH } from './route';

vi.mock('@/lib/admin-auth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { order: { findUnique: vi.fn(), update: vi.fn() } } }));

const admin = requireAdmin as unknown as ReturnType<typeof vi.fn>;
const order = prisma.order as unknown as Record<'findUnique' | 'update', ReturnType<typeof vi.fn>>;

const patch = (body: unknown) =>
  PATCH(new Request('http://localhost/api', { method: 'PATCH', body: JSON.stringify(body) }), { params: { id: 'o1' } });

beforeEach(() => {
  vi.resetAllMocks();
  admin.mockResolvedValue({ ok: true, session: {} });
});

describe('PATCH /api/v1/admin/onsite/{id}', () => {
  it('수령 처리는 수령상태만 바꾸고 결제상태는 건드리지 않는다(결제와 수령은 별개 축)', async () => {
    order.findUnique.mockResolvedValue({
      id: 'o1',
      paymentMethod: ORDER_PAYMENT_METHOD.ON_SITE,
      paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
    });

    const res = await patch({ receiptStatus: ORDER_RECEIPT_STATUS.RECEIVED });

    expect(res.status).toBe(200);
    expect(order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { receiptStatus: 'RECEIVED' } });
  });

  it('주문취소는 CANCELED로 바꾸고 수령상태는 건드리지 않는다', async () => {
    order.findUnique.mockResolvedValue({ id: 'o1', paymentMethod: ORDER_PAYMENT_METHOD.ON_SITE, paymentStatus: ORDER_PAYMENT_STATUS.PAID });

    const res = await patch({ paymentStatus: ORDER_PAYMENT_STATUS.CANCELED });

    expect(res.status).toBe(200);
    expect(order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { paymentStatus: 'CANCELED' } });
  });

  it('취소된 주문은 수령 상태를 바꿀 수 없다', async () => {
    order.findUnique.mockResolvedValue({ id: 'o1', paymentMethod: ORDER_PAYMENT_METHOD.ONLINE, paymentStatus: ORDER_PAYMENT_STATUS.CANCELED });

    const res = await patch({ receiptStatus: ORDER_RECEIPT_STATUS.RECEIVED });

    expect(res.status).toBe(400);
    expect(order.update).not.toHaveBeenCalled();
  });
});
