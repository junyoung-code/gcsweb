// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { hashGuestToken } from '@/lib/qrshop/guest-token';
import { confirmOrderPayment } from '@/lib/qrshop/payment-confirm';
import { POST } from './route';

vi.mock('@/lib/db', () => ({
  prisma: { order: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/qrshop/payment-confirm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/qrshop/payment-confirm')>()),
  confirmOrderPayment: vi.fn(),
}));

type Fn = ReturnType<typeof vi.fn>;
const findOrder = prisma.order.findUnique as unknown as Fn;
const confirm = confirmOrderPayment as unknown as Fn;

const TOKEN = 'guest-token-1';

const orderRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'ord1',
  buyerGuestTokenHash: hashGuestToken(TOKEN),
  orderNumber: { orderNo: 147 },
  ...overrides,
});

const verify = (token: string | null = TOKEN) =>
  POST(
    new Request('http://localhost/api/v2/qrshop/orders/ord1/payment/verify', {
      method: 'POST',
      headers: token === null ? {} : { 'x-guest-token': token },
    }),
    { params: { orderId: 'ord1' } },
  );

const soldOutItems = [{ productId: 'p1', optionId: 'o1', name: '키링', optionName: 'black', availableQuantity: 0 }];

beforeEach(() => {
  vi.resetAllMocks();
  findOrder.mockResolvedValue(orderRow());
});

describe('POST /api/v2/qrshop/orders/:orderId/payment/verify', () => {
  it('토큰이 없거나 틀리면 404, 확정 로직을 부르지 않는다', async () => {
    expect((await verify(null)).status).toBe(404);
    expect((await verify('wrong')).status).toBe(404);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('QR샵 주문이 아니면 404', async () => {
    findOrder.mockResolvedValue(orderRow({ orderNumber: null }));
    expect((await verify()).status).toBe(404);
  });

  it('결제 확정되면 verified:true', async () => {
    confirm.mockResolvedValue({ kind: 'PAID', alreadyPaid: false });
    const res = await verify();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ verified: true, paymentStatus: 'PAID' });
  });

  it('결제 전이면 verified:false + 현재 상태 (시간이 지나도 PENDING 유지)', async () => {
    confirm.mockResolvedValue({ kind: 'NOT_PAID', paymentStatus: 'PENDING' });
    expect((await (await verify()).json()).data).toEqual({ verified: false, paymentStatus: 'PENDING' });
  });

  it('PG 승인 실패로 FAILED 가 됐으면 그대로 FAILED', async () => {
    confirm.mockResolvedValue({ kind: 'NOT_PAID', paymentStatus: 'FAILED', portoneStatus: 'FAILED' });
    expect((await (await verify()).json()).data).toEqual({ verified: false, paymentStatus: 'FAILED' });
  });

  it('결제 후 재고 부족이면 409 STOCK_SHORTAGE + soldOutItems', async () => {
    confirm.mockResolvedValue({ kind: 'STOCK_SHORTAGE', soldOutItems, refunded: true });
    const res = await verify();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: 'error',
      code: 'STOCK_SHORTAGE',
      message: '품절된 상품',
      data: { soldOutItems },
    });
  });

  it('이미 재고 부족으로 취소된 주문이면 409 STOCK_SHORTAGE (항목 없음), 그 외 종료 주문은 verified:false', async () => {
    confirm.mockResolvedValue({ kind: 'CLOSED', paymentStatus: 'CANCELED', cancelReason: 'STOCK_SHORTAGE' });
    const res = await verify();
    expect(res.status).toBe(409);
    expect((await res.json()).data).toBeUndefined();

    confirm.mockResolvedValue({ kind: 'CLOSED', paymentStatus: 'CANCELED', cancelReason: 'OTHER' });
    expect((await (await verify()).json()).data).toEqual({ verified: false, paymentStatus: 'CANCELED' });
  });

  it('금액 불일치면 409 PAYMENT_AMOUNT_MISMATCH', async () => {
    confirm.mockResolvedValue({ kind: 'AMOUNT_MISMATCH' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await verify();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('PAYMENT_AMOUNT_MISMATCH');
  });

  it('PortOne 조회 실패·DB 오류면 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    confirm.mockResolvedValue({ kind: 'LOOKUP_FAILED', code: 'API_ERROR' });
    expect((await verify()).status).toBe(500);
    findOrder.mockRejectedValue(new Error('db down'));
    expect((await verify()).status).toBe(500);
  });
});
