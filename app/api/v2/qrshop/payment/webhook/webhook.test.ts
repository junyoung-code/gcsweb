// @vitest-environment node
import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmOrderPayment } from '@/lib/qrshop/payment-confirm';
import { POST } from './route';

vi.mock('@/lib/qrshop/payment-confirm', () => ({ confirmOrderPayment: vi.fn() }));

type Fn = ReturnType<typeof vi.fn>;
const confirm = confirmOrderPayment as unknown as Fn;

const RAW_SECRET = crypto.randomBytes(32);
const SECRET = `whsec_${RAW_SECRET.toString('base64')}`;

const event = (type: string, paymentId: unknown = 'ord1') =>
  JSON.stringify({ type, timestamp: '2026-10-27T12:00:00Z', data: { storeId: 'store-xxxx', paymentId } });

/** 실제 PortOne 과 같은 방식으로 서명한 요청 */
const signed = (body: string, { signWith = RAW_SECRET } = {}) => {
  const id = 'msg_1';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', signWith).update(`${id}.${ts}.${body}`).digest('base64');
  return new Request('http://localhost/api/v2/qrshop/payment/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` },
    body,
  });
};

let infoLog: Fn;
let warnLog: Fn;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PORTONE_WEBHOOK_SECRET', SECRET);
  confirm.mockResolvedValue({ kind: 'PAID', alreadyPaid: false });
  infoLog = vi.spyOn(console, 'info').mockImplementation(() => {}) as unknown as Fn;
  warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {}) as unknown as Fn;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/v2/qrshop/payment/webhook', () => {
  it.each(['Transaction.Paid', 'Transaction.Failed'])('%s 이면 결제 ID 로 결제 확정을 호출하고 200', async (type) => {
    const res = await POST(signed(event(type)));
    expect(res.status).toBe(200);
    expect(confirm).toHaveBeenCalledWith('ord1');
  });

  it('서명이 틀리면 401, 처리하지 않는다', async () => {
    const res = await POST(signed(event('Transaction.Paid'), { signWith: crypto.randomBytes(32) }));
    expect(res.status).toBe(401);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('처리 대상이 아닌 이벤트·결제 ID 없음은 200 으로 무시한다', async () => {
    expect((await POST(signed(event('Transaction.Ready')))).status).toBe(200);
    expect((await POST(signed(event('BillingKey.Issued')))).status).toBe(200);
    expect((await POST(signed(event('Transaction.Paid', null)))).status).toBe(200);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('서명은 맞지만 JSON 이 아니면 200 으로 무시한다 (재전송해도 소용없음)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await POST(signed('not-json'))).status).toBe(200);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'NOT_FOUND' }],
    [{ kind: 'CLOSED', paymentStatus: 'CANCELED', cancelReason: 'STOCK_SHORTAGE' }],
    [{ kind: 'NOT_PAID', paymentStatus: 'FAILED' }],
    [{ kind: 'STOCK_SHORTAGE', soldOutItems: [], refunded: true }],
    [{ kind: 'AMOUNT_MISMATCH' }],
  ])('처리 결과가 %o 여도 200 (재전송 불필요)', async (result) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    confirm.mockResolvedValue(result);
    expect((await POST(signed(event('Transaction.Paid')))).status).toBe(200);
  });

  it('PortOne 조회 실패·서버 오류는 500 (PortOne 이 재전송)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    confirm.mockResolvedValue({ kind: 'LOOKUP_FAILED', code: 'API_ERROR' });
    expect((await POST(signed(event('Transaction.Paid')))).status).toBe(500);
    confirm.mockRejectedValue(new Error('db down'));
    expect((await POST(signed(event('Transaction.Paid')))).status).toBe(500);
  });

  describe('수신 로그 (webhook-id 와 결과 한 줄)', () => {
    const lastLog = (spy: Fn) => JSON.parse(spy.mock.calls.at(-1)![1] as string);

    it('처리 완료: outcome=processed, webhook-id·결제 ID·확정 결과', async () => {
      await POST(signed(event('Transaction.Paid')));
      expect(infoLog.mock.calls.at(-1)![0]).toBe('[qrshop/webhook]');
      expect(lastLog(infoLog)).toEqual({
        outcome: 'processed',
        webhookId: 'msg_1',
        type: 'Transaction.Paid',
        paymentId: 'ord1',
        result: 'PAID',
      });
    });

    it('대상 아님: outcome=ignored', async () => {
      await POST(signed(event('Transaction.Ready')));
      expect(lastLog(infoLog)).toEqual({ outcome: 'ignored', webhookId: 'msg_1', type: 'Transaction.Ready' });
    });

    it('서명 불일치: warn 으로 outcome=invalid_signature (서명 값은 남기지 않는다)', async () => {
      await POST(signed(event('Transaction.Paid'), { signWith: crypto.randomBytes(32) }));
      expect(lastLog(warnLog)).toEqual({ outcome: 'invalid_signature', webhookId: 'msg_1' });
      expect(JSON.stringify(warnLog.mock.calls)).not.toContain('v1,');
    });
  });

  it('시크릿 환경변수가 없으면 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('PORTONE_WEBHOOK_SECRET', '');
    expect((await POST(signed(event('Transaction.Paid')))).status).toBe(500);
    expect(confirm).not.toHaveBeenCalled();
  });
});
