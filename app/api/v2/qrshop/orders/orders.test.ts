// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { isPortoneCheckoutConfigured } from '@/lib/payment/portone';
import { hashGuestToken } from '@/lib/qrshop/guest-token';
import { issueOrderNumber } from '@/lib/qrshop/order-number';
import { validateOrderItems } from '@/lib/qrshop/order-validation';
import { POST } from './route';

vi.mock('@/lib/db', () => ({
  prisma: { order: { create: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock('@/lib/payment/portone', () => ({
  isPortoneCheckoutConfigured: vi.fn(),
  getPortoneCheckoutPaymentConfig: () => ({ storeId: 'store-xxxx', channelKey: 'channel-xxxx' }),
}));
vi.mock('@/lib/qrshop/order-validation', () => ({ validateOrderItems: vi.fn() }));
vi.mock('@/lib/qrshop/order-number', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/qrshop/order-number')>()),
  issueOrderNumber: vi.fn(),
}));

type Fn = ReturnType<typeof vi.fn>;
const createOrder = prisma.order.create as unknown as Fn;
const transaction = prisma.$transaction as unknown as Fn;
const configured = isPortoneCheckoutConfigured as unknown as Fn;
const validate = validateOrderItems as unknown as Fn;
const issueNo = issueOrderNumber as unknown as Fn;

const VALIDATED = {
  ok: true,
  store: { storeId: 's1', name: '열반급행', storeSlug: 'nirvanaexpress' },
  lines: [
    { productId: 'p1', optionId: 'o1', productName: '키캡키링 A', optionName: '4일차', unitPrice: 6000, quantity: 2 },
    { productId: 'p2', optionId: null, productName: '엽서 A', optionName: null, unitPrice: 2000, quantity: 1 },
  ],
  paymentAmount: 14000,
  orderName: '키캡키링 A 외 1건',
};

const BODY = {
  termsAgreed: true,
  items: [
    { productId: 'p1', optionId: 'o1', quantity: 2 },
    { productId: 'p2', quantity: 1 },
  ],
};

const post = (body: unknown, qs = '?storeSlug=nirvanaexpress') =>
  POST(
    new Request(`http://localhost/api/v2/qrshop/orders${qs}`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  configured.mockReturnValue(true);
  validate.mockResolvedValue(VALIDATED);
  transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  createOrder.mockResolvedValue({ id: 'ord1' });
  issueNo.mockResolvedValue({ orderNo: 147, orderTimeKey: '261027' });
});

describe('POST /api/v2/qrshop/orders', () => {
  it('주문을 만들고 주문번호·토큰·결제창 값을 돌려준다', async () => {
    const res = await post(BODY);
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data).toMatchObject({
      orderId: 'ord1',
      orderNo: 147,
      paymentAmount: 14000,
      payment: { storeId: 'store-xxxx', channelKey: 'channel-xxxx', orderName: '키캡키링 A 외 1건' },
    });
    expect(typeof data.guestToken).toBe('string');
    expect(data).not.toHaveProperty('orderName');

    const { data: created } = createOrder.mock.calls[0][0];
    expect(created).toMatchObject({
      paymentAmount: 14000,
      paymentMethod: 'ONLINE',
      buyerType: 'GUEST',
      buyerGuestTokenHash: hashGuestToken(data.guestToken),
    });
    expect(created).not.toHaveProperty('userId');
    expect(created.items.create).toEqual([
      {
        onsiteProductId: 'p1',
        onsiteOptionId: 'o1',
        onsiteProductName: '키캡키링 A',
        onsiteOptionName: '4일차',
        price: 6000,
        quantity: 2,
      },
      {
        onsiteProductId: 'p2',
        onsiteOptionId: null,
        onsiteProductName: '엽서 A',
        onsiteOptionName: null,
        price: 2000,
        quantity: 1,
      },
    ]);
    expect(issueNo).toHaveBeenCalledWith(prisma, { orderId: 'ord1', storeId: 's1' });
    expect(validate).toHaveBeenCalledWith(prisma, { storeSlug: 'nirvanaexpress', items: BODY.items });
  });

  it('storeSlug가 없거나 형식이 틀리면 400', async () => {
    expect((await post(BODY, '')).status).toBe(400);
    expect((await post(BODY, '?storeSlug=%40nirvanaexpress')).status).toBe(400);
    expect(validate).not.toHaveBeenCalled();
  });

  it('약관 미동의면 400', async () => {
    const res = await post({ ...BODY, termsAgreed: false });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'INVALID_INPUT', message: '약관 동의 필요' });
  });

  it('본문 형식이 틀리면 400 (JSON 아님, 빈 항목, 수량 0·소수)', async () => {
    for (const body of [
      'not-json',
      { ...BODY, items: [] },
      { ...BODY, items: [{ productId: 'p1', quantity: 0 }] },
      { ...BODY, items: [{ productId: 'p1', quantity: 1.5 }] },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(createOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['STORE_NOT_FOUND', 404, '존재하지 않는 상점'],
    ['PRODUCT_NOT_FOUND', 404, '존재하지 않는 상품'],
    ['OPTION_NOT_FOUND', 404, '존재하지 않는 옵션'],
    ['OPTION_REQUIRED', 400, '옵션 선택 필요'],
    ['OPTION_NOT_ALLOWED', 400, '옵션 미사용 상품'],
  ])('검증 실패 %s → %i', async (reason, status, message) => {
    validate.mockResolvedValue({ ok: false, reason });
    const res = await post(BODY);
    expect(res.status).toBe(status);
    expect((await res.json()).message).toBe(message);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('품절·재고 부족이면 409 SOLD_OUT과 soldOutItems, 주문은 만들지 않는다', async () => {
    const soldOutItems = [{ productId: 'p1', optionId: 'o1', name: '키캡키링 A', optionName: '4일차', availableQuantity: 3 }];
    validate.mockResolvedValue({ ok: false, reason: 'SOLD_OUT', soldOutItems });

    const res = await post(BODY);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      status: 'error',
      code: 'SOLD_OUT',
      message: '품절된 상품',
      data: { soldOutItems },
    });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('PortOne 설정이 없으면 주문을 만들지 않고 500', async () => {
    configured.mockReturnValue(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post(BODY)).status).toBe(500);
    expect(validate).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('주문번호 unique 충돌이면 트랜잭션째 다시 시도한다', async () => {
    const { Prisma } = await import('@prisma/client');
    const conflict = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['storeId', 'orderTimeKey', 'orderNo'] },
    });
    issueNo.mockRejectedValueOnce(conflict).mockResolvedValueOnce({ orderNo: 148, orderTimeKey: '261027' });

    const res = await post(BODY);
    expect(res.status).toBe(200);
    expect((await res.json()).data.orderNo).toBe(148);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('DB 오류면 500', async () => {
    createOrder.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post(BODY)).status).toBe(500);
  });
});
