import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQrshopApiService } from './qrshop-api-service';
import { PAYMENT_SESSION_MISSING, PAYMENT_SESSION_UNAVAILABLE, savePaymentSession } from '@/lib/qrshop/payment-session';

const sdk = vi.hoisted(() => ({ requestPayment: vi.fn() }));
vi.mock('@portone/browser-sdk/v2', () => sdk);
const payment = { storeId: 'portone-store', channelKey: 'channel', orderName: '서버 주문명' };
const session = { storeSlug: 'shop1234', guestToken: 'private-token-1', payment };
const created = { orderId: 'order1', orderNo: 23, paymentAmount: 6200, guestToken: session.guestToken, payment };
const draft = { termsAgreed: true, buyerName: '전송 금지', buyerPhone: '01012341234', paymentMethod: 'online' as const,
  lines: [{ productId: 'p1:o1', sourceProductId: 'p1', optionId: 'o1', productName: '상품', quantity: 2, unitPrice: 1 }] };
const serverOrder = { orderId: 'order1', orderNo: null as number | null, paymentAmount: 6200, paymentStatus: 'PENDING',
  failureCode: 'PAYMENT_NOT_COMPLETED' as string | null, failureMessage: '결제가 완료되지 않았습니다.' as string | null,
  orderedAt: '2026-11-07T00:00:00Z', store: { name: '상점', storeSlug: 'shop1234' },
  items: [{ name: '상품', optionName: '선택', unitPrice: 3100, quantity: 2, soldOut: false }] };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data }) });
const error = (code: string, status = 409) => ({ ok: false, status, json: async () => ({ status: 'error', code, message: code }) });
const paid = { ...serverOrder, paymentStatus: 'PAID', orderNo: 23, failureCode: null, failureMessage: null };

beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); sdk.requestPayment.mockResolvedValue({ paymentId: 'order1' }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('QRshop 주문·결제 API', () => {
  it('동의·상품/옵션ID·수량만 전송하고 서버 금액을 사용하며 토큰·미결제 번호를 공개 결과에서 제외한다', async () => {
    const fetcher = vi.fn().mockResolvedValue(ok(created)); vi.stubGlobal('fetch', fetcher);
    const result = await createQrshopApiService('shop1234').createOrder(draft);
    expect(fetcher).toHaveBeenCalledWith('/api/v2/qrshop/orders?storeSlug=shop1234', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termsAgreed: true, items: [{ productId: 'p1', optionId: 'o1', quantity: 2 }] }),
    });
    expect(result).toMatchObject({ totalAmount: 6200, orderCode: '', status: 'pending' });
    expect(JSON.stringify(result)).not.toContain(session.guestToken);
    expect(JSON.parse(sessionStorage.getItem('gcs:qrshop:payment:order1')!)).toEqual(session);
  });

  it('동의하지 않으면 주문을 생성하지 않는다', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(createQrshopApiService('shop1234').createOrder({ ...draft, termsAgreed: false })).rejects.toThrow('약관 동의');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('세션 저장이 차단되면 서버 주문 생성 전에 멈춘다', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await expect(createQrshopApiService('shop1234').createOrder(draft)).rejects.toThrow(PAYMENT_SESSION_UNAVAILABLE);
    expect(fetcher).not.toHaveBeenCalled(); expect(sdk.requestPayment).not.toHaveBeenCalled();
  });

  it('사전 점검 후 실제 주문 인증 저장이 실패해도 결제를 실행하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(created)));
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.endsWith('order1')) throw new Error('quota');
      original.call(this, key, value);
    });
    await expect(createQrshopApiService('shop1234').createOrder(draft)).rejects.toThrow('주문은 생성되었지만');
    expect(sdk.requestPayment).not.toHaveBeenCalled();
  });

  it('주문별 토큰으로 새 서비스에서도 조회하며 다른 상점·누락·깨진 세션은 요청하지 않는다', async () => {
    savePaymentSession('order1', session);
    savePaymentSession('order2', { ...session, guestToken: 'private-token-2' });
    const fetcher = vi.fn().mockResolvedValueOnce(ok(serverOrder)).mockResolvedValueOnce(ok({ ...serverOrder, orderId: 'order2' }));
    vi.stubGlobal('fetch', fetcher);
    await createQrshopApiService('shop1234').getOrder('order1');
    await createQrshopApiService('shop1234').getOrder('order2');
    expect(fetcher.mock.calls.map(call => call[1].headers)).toEqual([{ 'X-Guest-Token': session.guestToken }, { 'X-Guest-Token': 'private-token-2' }]);
    await expect(createQrshopApiService('next1234').getOrder('order1')).rejects.toThrow(PAYMENT_SESSION_MISSING);
    await expect(createQrshopApiService('shop1234').getOrder('missing')).rejects.toThrow(PAYMENT_SESSION_MISSING);
    sessionStorage.setItem('gcs:qrshop:payment:broken', '{');
    await expect(createQrshopApiService('shop1234').getOrder('broken')).rejects.toThrow(PAYMENT_SESSION_MISSING);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(call => !call[0].includes('private-token'))).toBe(true);
  });

  it('verify와 GET을 사용하고 SDK 성공만으로는 완료하지 않으며 서버 금액/설정을 SDK에 전달한다', async () => {
    savePaymentSession('order1', session);
    const fetcher = vi.fn().mockResolvedValueOnce(ok({ verified: false, paymentStatus: 'PENDING' })).mockResolvedValueOnce(ok(serverOrder))
      .mockResolvedValueOnce(ok({ verified: false, paymentStatus: 'PENDING' })).mockResolvedValueOnce(ok(serverOrder));
    vi.stubGlobal('fetch', fetcher);
    const result = await createQrshopApiService('shop1234').startPayment!('order1');
    expect(result).toMatchObject({ status: 'pending', orderCode: '', failureCode: 'PAYMENT_NOT_COMPLETED' });
    expect(sdk.requestPayment).toHaveBeenCalledWith({ ...payment, paymentId: 'order1', totalAmount: 6200,
      currency: 'CURRENCY_KRW', payMethod: 'CARD', redirectUrl: `${window.location.origin}/QRshop/result?orderId=order1&storeSlug=shop1234` });
    expect(JSON.stringify(sdk.requestPayment.mock.calls)).not.toContain(session.guestToken);
    expect(fetcher.mock.calls.map(call => [call[0], call[1].method ?? 'GET'])).toEqual([
      ['/api/v2/qrshop/orders/order1/payment/verify', 'POST'], ['/api/v2/qrshop/orders/order1', 'GET'],
      ['/api/v2/qrshop/orders/order1/payment/verify', 'POST'], ['/api/v2/qrshop/orders/order1', 'GET'],
    ]);
    expect(fetcher.mock.calls.every(call => call[1].headers['X-Guest-Token'] === session.guestToken)).toBe(true);
  });

  it.each(['cancel', 'undefined', 'throw'])('SDK %s 결과도 서버 상태로 확인한다', async kind => {
    savePaymentSession('order1', session);
    if (kind === 'throw') sdk.requestPayment.mockRejectedValueOnce(new Error('SDK 오류'));
    else sdk.requestPayment.mockResolvedValueOnce(kind === 'cancel' ? { code: 'FAILURE_TYPE_PG', message: '취소' } : undefined);
    const fetcher = vi.fn().mockResolvedValueOnce(ok({ verified: false })).mockResolvedValueOnce(ok(serverOrder))
      .mockResolvedValueOnce(ok({ verified: false })).mockResolvedValueOnce(ok(serverOrder));
    vi.stubGlobal('fetch', fetcher);
    const result = createQrshopApiService('shop1234').startPayment!('order1');
    if (kind === 'undefined') expect((await result).status).toBe('pending');
    else await expect(result).rejects.toThrow(kind === 'throw' ? 'SDK 오류' : '[FAILURE_TYPE_PG]: 취소');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('SDK 진단에는 코드·메시지만 표시하고 주문 인증값과 연동 식별값을 가린다', async () => {
    savePaymentSession('order1', session);
    sdk.requestPayment.mockResolvedValueOnce({ code: 'FAILURE_TYPE_INVALID_REQUEST',
      message: `customer.fullName required ${session.guestToken} ${payment.channelKey} ${payment.storeId} order1`,
      extra: { secret: 'must-not-be-shown' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ verified: false })).mockResolvedValueOnce(ok(serverOrder))
      .mockResolvedValueOnce(ok({ verified: false })).mockResolvedValueOnce(ok(serverOrder)));
    await expect(createQrshopApiService('shop1234').startPayment!('order1')).rejects.toThrow(
      '결제창 오류 [FAILURE_TYPE_INVALID_REQUEST]: customer.fullName required [REDACTED] [REDACTED] [REDACTED] [REDACTED]');
  });

  it('SDK 오류가 있어도 서버가 결제완료를 확인하면 완료 상태를 보존한다', async () => {
    savePaymentSession('order1', session);
    sdk.requestPayment.mockRejectedValueOnce(new Error('SDK 오류'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ verified: false })).mockResolvedValueOnce(ok(serverOrder))
      .mockResolvedValueOnce(ok({ verified: true })).mockResolvedValueOnce(ok(paid)));
    await expect(createQrshopApiService('shop1234').startPayment!('order1')).resolves.toMatchObject({ status: 'paid' });
  });

  it.each([
    { data: paid, status: 'paid', code: '23' },
    { data: { ...serverOrder, paymentStatus: 'CANCELED', failureCode: 'STOCK_SHORTAGE' }, status: 'canceled', code: '' },
    { data: { ...serverOrder, paymentStatus: 'CANCELED', failureCode: 'REFUND_PENDING' }, status: 'refund-pending', code: '' },
  ])('기존 $status 주문은 SDK를 다시 열지 않는다', async ({ data, status, code }) => {
    savePaymentSession('order1', session);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ verified: status === 'paid' })).mockResolvedValueOnce(ok(data)));
    expect(await createQrshopApiService('shop1234').startPayment!('order1')).toMatchObject({ status, orderCode: code });
    expect(sdk.requestPayment).not.toHaveBeenCalled();
  });

  it('품절409 후 GET의 환불대기 사유와 품절 항목을 보존한다', async () => {
    savePaymentSession('order1', session);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(error('STOCK_SHORTAGE')).mockResolvedValueOnce(ok({ ...serverOrder,
      paymentStatus: 'CANCELED', failureCode: 'REFUND_PENDING', failureMessage: '환불 확인 필요', items: [{ ...serverOrder.items[0], soldOut: true }] })));
    expect(await createQrshopApiService('shop1234').verifyPayment!('order1')).toMatchObject({ status: 'refund-pending',
      failureCode: 'REFUND_PENDING', failureMessage: '환불 확인 필요', orderCode: '', lines: [{ soldOut: true }] });
  });

  it('금액 불일치 및 verify 통신 실패는 성공으로 대체하지 않는다', async () => {
    savePaymentSession('order1', session);
    const fetcher = vi.fn().mockResolvedValueOnce(error('PAYMENT_AMOUNT_MISMATCH')).mockRejectedValueOnce(new Error('네트워크 오류'));
    vi.stubGlobal('fetch', fetcher);
    const service = createQrshopApiService('shop1234');
    await expect(service.verifyPayment!('order1')).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
    await expect(service.startPayment!('order1')).rejects.toThrow('네트워크 오류');
    expect(sdk.requestPayment).not.toHaveBeenCalled();
  });

  it('생성 품절409를 보존하고 인증 정보를 저장하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(error('SOLD_OUT')));
    await expect(createQrshopApiService('shop1234').createOrder(draft)).rejects.toMatchObject({ code: 'SOLD_OUT', status: 409 });
    expect(sessionStorage.getItem('gcs:qrshop:payment:order1')).toBeNull();
  });

  it('PAID라도 번호가 없으면 성공으로 표시하지 않고 상점 불일치 응답을 거부한다', async () => {
    savePaymentSession('order1', session);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ ...paid, orderNo: null }))
      .mockResolvedValueOnce(ok({ ...paid, store: { name: '다른상점', storeSlug: 'next1234' } })));
    const service = createQrshopApiService('shop1234');
    expect((await service.getOrder('order1')).status).toBe('pending');
    await expect(service.getOrder('order1')).rejects.toThrow('상점 정보');
  });
});
