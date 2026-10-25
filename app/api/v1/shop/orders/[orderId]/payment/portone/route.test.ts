// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { ORDER_PAYMENT_METHOD, ORDER_PAYMENT_STATUS } from '@/lib/order-status';
import { GET } from './route';

vi.mock('@/lib/db', () => ({ prisma: { order: { findFirst: vi.fn() } } }));
vi.mock('@/lib/payment/portone', () => ({
  isPortoneCheckoutConfigured: () => true,
  getPortoneCheckoutPaymentConfig: () => ({ storeId: 'store', channelKey: 'channel' }),
}));

const findFirst = (prisma.order as unknown as { findFirst: ReturnType<typeof vi.fn> }).findFirst;

const order = (overrides: Record<string, unknown> = {}) => ({
  id: 'o1',
  productType: 1,
  paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
  paymentAmount: 3000,
  ordererName: null,
  ordererPhone: null,
  user: null,
  items: [{ optionData: null, product: { name: '뽑기' } }],
  ...overrides,
});

const call = () => GET(new Request('http://localhost/api'), { params: { orderId: 'o1' } });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/v1/shop/orders/{orderId}/payment/portone', () => {
  it('결제 대기(PENDING) 주문만 조회한다', async () => {
    findFirst.mockResolvedValue(order());
    await call();
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: 'o1', paymentStatus: ORDER_PAYMENT_STATUS.PENDING });
  });

  it('QR샵 v1 주문은 새 결제를 시작하지 않고 410', async () => {
    findFirst.mockResolvedValue(order({ items: [{ optionData: { source: 'qrshop', qrItemId: 'postcard_a' }, product: null }] }));
    const res = await call();
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: 'QRSHOP_V1_DISABLED' });
  });

  it('현장결제 주문은 PortOne 결제 대상이 아니다', async () => {
    findFirst.mockResolvedValue(order({ paymentMethod: ORDER_PAYMENT_METHOD.ON_SITE }));
    const res = await call();
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'COUNTER_PAYMENT_NOT_SUPPORTED' });
  });

  it('shop buynow 온라인 주문은 정상적으로 결제 파라미터를 돌려준다', async () => {
    findFirst.mockResolvedValue(order());
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ paymentId: 'o1', totalAmount: 3000, orderName: '뽑기' });
    expect(body.data.redirectUrl).toMatch(/\/shop\/orders\/buynow\/result$/);
  });
});
