import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelPayment, getPayment } from './portone';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('portone', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('PORTONE_API_SECRET', 'secret');
    vi.stubEnv('PORTONE_STORE_ID', 'store-1');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('cancelPayment', () => {
    it('전액 취소 요청을 보낸다 (amount 생략)', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { cancellation: {} }));

      expect(await cancelPayment({ paymentId: 'ord 1', reason: '재고 부족' })).toEqual({ success: true });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.portone.io/payments/ord%201/cancel');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('PortOne secret');
      expect(JSON.parse(init.body)).toEqual({ reason: '재고 부족', storeId: 'store-1' });
    });

    it('amount 를 주면 부분 취소로 보낸다', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));
      await cancelPayment({ paymentId: 'ord1', reason: 'r', amount: 3000 });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).amount).toBe(3000);
    });

    it('이미 취소된 결제는 성공으로 본다 (멱등)', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { type: 'PAYMENT_ALREADY_CANCELLED', message: 'already' }));
      expect(await cancelPayment({ paymentId: 'ord1', reason: 'r' })).toEqual({ success: true, alreadyCanceled: true });
    });

    it('그 밖의 오류는 실패로 돌려준다', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockResolvedValue(jsonResponse(404, { type: 'PAYMENT_NOT_FOUND', message: 'nope' }));
      expect(await cancelPayment({ paymentId: 'ord1', reason: 'r' })).toEqual({
        success: false,
        code: 'PAYMENT_NOT_FOUND',
        message: 'nope',
      });
      spy.mockRestore();
    });

    it('네트워크 오류도 예외 없이 실패로 돌려준다', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockRejectedValue(new Error('offline'));
      expect(await cancelPayment({ paymentId: 'ord1', reason: 'r' })).toMatchObject({ success: false, code: 'NETWORK_ERROR' });
      spy.mockRestore();
    });

    it('시크릿이 없으면 호출하지 않는다', async () => {
      vi.stubEnv('PORTONE_API_SECRET', '');
      expect(await cancelPayment({ paymentId: 'ord1', reason: 'r' })).toMatchObject({ success: false, code: 'CONFIG_MISSING' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('getPayment', () => {
    it('결제 건이 없으면(404) notFound 로 구분한다', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockResolvedValue(jsonResponse(404, { type: 'PAYMENT_NOT_FOUND' }));
      expect(await getPayment('ord1')).toMatchObject({ success: false, notFound: true });
      spy.mockRestore();
    });

    it('다른 HTTP 오류는 notFound 가 아니다', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockResolvedValue(jsonResponse(500, { type: 'UNKNOWN' }));
      expect(await getPayment('ord1')).toMatchObject({ success: false, notFound: false });
      spy.mockRestore();
    });
  });
});
