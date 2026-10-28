// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { ORDER_PAYMENT_METHOD } from '@/lib/order-status';
import { SHOP_STORE_SLUG } from '@/lib/shop-store';
import { POST } from './route';

vi.mock('next-auth', () => ({ getServerSession: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/sale-date', () => ({ getSaleStatusByDate: () => 'active' }));
vi.mock('@/lib/db', () => ({
  prisma: { product: { findMany: vi.fn() }, store: { findUnique: vi.fn() }, $transaction: vi.fn() },
}));

type Fn = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  product: { findMany: Fn };
  store: { findUnique: Fn };
  $transaction: Fn;
};

const tx = {
  $executeRaw: vi.fn(),
  order: { create: vi.fn() },
  orderItem: { create: vi.fn() },
  orderNumber: { aggregate: vi.fn(), create: vi.fn() },
};

const body = {
  productType: 1,
  receiveMethod: 1,
  paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
  isPolicyAgreed: true,
  items: [{ productId: 'p1', quantity: 2, optionData: null }],
  // 옛 클라이언트가 보내는 봉투 옵션은 무시된다
  bagOption: true,
};

const post = (payload: unknown = body) =>
  POST(
    new Request('http://localhost/api/v1/shop/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-guest-token': 'guest-token' },
      body: JSON.stringify(payload),
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  db.product.findMany.mockResolvedValue([
    {
      id: 'p1', type: 1, receiveMethod: 1, status: 1, isPublic: true, isAdminApproved: true,
      salesStartDate: null, salesEndDate: null, price: 3000, variants: [],
    },
  ]);
  db.store.findUnique.mockResolvedValue({ storeId: 'shop-store' });
  db.$transaction.mockImplementation((run: (client: typeof tx) => unknown) => run(tx));
  tx.order.create.mockResolvedValue({ id: 'o1', productType: 1, paymentAmount: 6000 });
  tx.orderItem.create.mockResolvedValue({ productId: 'p1', quantity: 2, price: 3000, optionData: null });
  tx.orderNumber.aggregate.mockResolvedValue({ _max: { orderNo: 30 } });
});

describe('POST /api/v1/shop/orders 주문번호', () => {
  it('플레이스홀더 상점(goat)의 PRE_ORDER 주문번호를 같은 트랜잭션에서 발급하고 orderNo 로 내려준다', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(db.store.findUnique).toHaveBeenCalledWith({ where: { storeSlug: SHOP_STORE_SLUG }, select: { storeId: true } });
    expect(tx.orderNumber.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: 'o1', orderNo: 31, type: 'PRE_ORDER', storeId: 'shop-store' }),
    });
    const { order } = (await res.json()).data;
    expect(order.orderNo).toBe(31);
    expect(order).not.toHaveProperty('orderCode');
  });

  it('봉투 옵션(bagOption)은 받지 않고 금액에도 더하지 않는다', async () => {
    await post();
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('bagOption');
    expect(data.paymentAmount).toBe(6000);
  });

  it('플레이스홀더 상점이 없으면 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.store.findUnique.mockResolvedValue(null);
    expect((await post()).status).toBe(500);
    expect(tx.order.create).not.toHaveBeenCalled();
  });
});
