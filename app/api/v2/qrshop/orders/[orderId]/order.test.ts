// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { hashGuestToken } from '@/lib/qrshop/guest-token';
import { refreshUnconfirmedOrder } from '@/lib/qrshop/payment-confirm';
import { GET } from './route';

vi.mock('@/lib/db', () => ({
  prisma: { order: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/qrshop/payment-confirm', () => ({
  CANCEL_REASON_STOCK_SHORTAGE: 'STOCK_SHORTAGE',
  refreshUnconfirmedOrder: vi.fn(),
}));

type Fn = ReturnType<typeof vi.fn>;
const findOrder = prisma.order.findUnique as unknown as Fn;
const settle = refreshUnconfirmedOrder as unknown as Fn;

const TOKEN = 'guest-token-1';

const orderRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'ord1',
  buyerGuestTokenHash: hashGuestToken(TOKEN),
  paymentStatus: 'PAID',
  paymentAmount: 15000,
  cancelReason: null,
  refundFailedAt: null,
  createdAt: new Date('2026-04-03T02:15:00.000Z'),
  orderNumber: { orderNo: 147, store: { name: '열반급행', storeSlug: 'nirvanaexpress' } },
  items: [{ onsiteProductName: '키캡키링 A', onsiteOptionName: '4일차', price: 5000, quantity: 3 }],
  ...overrides,
});

const get = (token: string | null = TOKEN) =>
  GET(
    new Request('http://localhost/api/v2/qrshop/orders/ord1', {
      headers: token === null ? {} : { 'x-guest-token': token },
    }),
    { params: { orderId: 'ord1' } },
  );

beforeEach(() => {
  vi.resetAllMocks();
  settle.mockResolvedValue(false);
});

describe('GET /api/v2/qrshop/orders/:orderId', () => {
  it('결제 완료 주문은 주문번호와 항목을 내려주고 failure 는 null', async () => {
    findOrder.mockResolvedValue(orderRow());
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      orderId: 'ord1',
      orderNo: 147,
      paymentStatus: 'PAID',
      failureCode: null,
      failureMessage: null,
      orderedAt: '2026-04-03T02:15:00.000Z',
      paymentAmount: 15000,
      store: { name: '열반급행', storeSlug: 'nirvanaexpress' },
      items: [{ name: '키캡키링 A', optionName: '4일차', unitPrice: 5000, quantity: 3 }],
    });
  });

  it('토큰이 없거나 틀리면 404 (주문 존재 여부를 숨긴다)', async () => {
    findOrder.mockResolvedValue(orderRow());
    expect((await get(null)).status).toBe(404);
    expect((await get('wrong-token')).status).toBe(404);
  });

  it('주문이 없거나 QR샵 주문이 아니면 404', async () => {
    findOrder.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    findOrder.mockResolvedValue(orderRow({ orderNumber: null }));
    expect((await get()).status).toBe(404);
  });

  it.each([
    [{ paymentStatus: 'PENDING' }, 'PAYMENT_NOT_COMPLETED', '결제가 완료되지 않았습니다.'],
    [{ paymentStatus: 'FAILED' }, 'PAYMENT_FAILED', '결제가 실패되었습니다.'],
    [{ paymentStatus: 'CANCELED', cancelReason: 'STOCK_SHORTAGE' }, 'STOCK_SHORTAGE', '품절로 결제가 취소되었습니다.'],
    [{ paymentStatus: 'CANCELED', cancelReason: 'OTHER' }, 'PAYMENT_CANCELED', '결제가 취소되었습니다.'],
    [
      { paymentStatus: 'PENDING', cancelReason: 'STOCK_SHORTAGE', refundFailedAt: new Date() },
      'REFUND_PENDING',
      '품절로 결제가 취소되었습니다. 결제된 금액은 환불 예정입니다.',
    ],
  ])('결제 완료가 아니면 200 + failureCode, 주문번호는 null (%o)', async (overrides, code, message) => {
    findOrder.mockResolvedValue(orderRow(overrides));
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({
      orderNo: null,
      failureCode: code,
      failureMessage: message,
    });
  });

  it('미확정 주문은 PortOne 확인(늦은 결제 확정) 후 다시 읽은 상태로 응답한다', async () => {
    findOrder.mockResolvedValueOnce(orderRow({ paymentStatus: 'PENDING' })).mockResolvedValueOnce(orderRow());
    settle.mockResolvedValue(true);

    const { data } = await (await get()).json();
    expect(settle).toHaveBeenCalledTimes(1);
    expect(findOrder).toHaveBeenCalledTimes(2);
    expect(data).toMatchObject({ paymentStatus: 'PAID', orderNo: 147, failureCode: null });
  });

  it('토큰 검증 전에는 결제 확인을 하지 않는다', async () => {
    findOrder.mockResolvedValue(orderRow({ paymentStatus: 'PENDING' }));
    await get('wrong-token');
    expect(settle).not.toHaveBeenCalled();
  });

  it('DB 오류면 500', async () => {
    findOrder.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await get()).status).toBe(500);
  });
});
