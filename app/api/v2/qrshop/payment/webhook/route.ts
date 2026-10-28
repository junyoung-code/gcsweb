import { apiErrors, apiSuccess } from '@/lib/api-response';
import { verifyPortoneWebhook } from '@/lib/payment/portone-webhook';
import { confirmOrderPayment } from '@/lib/qrshop/payment-confirm';

export const dynamic = 'force-dynamic';

/** 결제 확정 로직을 돌릴 이벤트. 그 외 type 은 문서 안내대로 처리 없이 200 으로 무시한다. */
const HANDLED_EVENTS = new Set(['Transaction.Paid', 'Transaction.Failed']);

type WebhookPayload = { type?: unknown; data?: { paymentId?: unknown } };

/**
 * 수신마다 결과를 한 줄 JSON 으로 남긴다. PortOne 콘솔의 발송 내역(webhook-id)과 대조하는 용도이며,
 * 서명·본문 원문은 남기지 않는다. outcome: invalid_signature(401) | ignored(대상 아님) | processed(처리 완료).
 */
function logWebhook(level: 'info' | 'warn', fields: Record<string, unknown>) {
  console[level]('[qrshop/webhook]', JSON.stringify(fields));
}

/**
 * PortOne V2 결제 웹훅. 결제 후 방문객이 화면으로 돌아오지 못해 결제 검증이 호출되지 않은 주문을 보완한다.
 *
 * 서명(`PORTONE_WEBHOOK_SECRET`)이 맞을 때만 처리하고, 본문은 결제 ID 만 쓴다. 실제 상태·금액은
 * confirmOrderPayment 가 PortOne 을 직접 조회해 판단한다(결제 검증과 같은 로직, 멱등).
 *
 * 응답: 처리했거나 대상이 아니면 200. 서명 불일치 401. PortOne 조회 실패·서버 오류는 500 → PortOne 이 재전송한다.
 */
export async function POST(request: Request) {
  try {
    const webhookId = request.headers.get('webhook-id');
    const secret = process.env.PORTONE_WEBHOOK_SECRET?.trim();
    if (!secret) {
      console.error('[qrshop/webhook] PORTONE_WEBHOOK_SECRET not set');
      return apiErrors.serverError();
    }

    const body = await request.text();
    if (!verifyPortoneWebhook({ secret, headers: request.headers, body })) {
      logWebhook('warn', { outcome: 'invalid_signature', webhookId });
      return apiErrors.unauthorized('유효하지 않은 서명');
    }

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(body) as WebhookPayload;
    } catch {
      console.error('[qrshop/webhook] invalid JSON body', { webhookId });
      return apiSuccess(null);
    }

    const type = typeof payload.type === 'string' ? payload.type : null;
    const paymentId = payload.data?.paymentId;
    if (!type || !HANDLED_EVENTS.has(type) || typeof paymentId !== 'string') {
      logWebhook('info', { outcome: 'ignored', webhookId, type });
      return apiSuccess(null);
    }

    // PortOne 결제 ID = 주문 ID. QR샵 주문이 아니면 NOT_FOUND 로 끝난다.
    const result = await confirmOrderPayment(paymentId);
    if (result.kind === 'LOOKUP_FAILED') {
      console.error('[qrshop/webhook] PortOne lookup failed', { webhookId, paymentId, code: result.code ?? null });
      return apiErrors.serverError();
    }
    if (result.kind === 'AMOUNT_MISMATCH') {
      console.error('[qrshop/webhook] payment amount mismatch', { webhookId, paymentId });
    }
    logWebhook('info', { outcome: 'processed', webhookId, type, paymentId, result: result.kind });
    return apiSuccess(null);
  } catch (error) {
    console.error('[qrshop/webhook] POST error:', error);
    return apiErrors.serverError();
  }
}
