import { prisma } from '@/lib/db';
import { apiError, apiErrors, apiSuccess } from '@/lib/api-response';
import { ORDER_PAYMENT_STATUS } from '@/lib/order-status';
import { readGuestToken, verifyGuestToken } from '@/lib/qrshop/guest-token';
import {
  CANCEL_REASON_STOCK_SHORTAGE,
  confirmOrderPayment,
  isStalePending,
  markOrderFailed,
} from '@/lib/qrshop/payment-confirm';

export const dynamic = 'force-dynamic';

const ORDER_NOT_FOUND = '존재하지 않는 주문';
const SOLD_OUT_MESSAGE = '품절된 상품';

type Params = { params: { orderId: string } };

/**
 * 방문객 결제 검증. PortOne 결제창에서 돌아온 프론트가 호출한다(헤더 `X-Guest-Token`).
 *
 * PortOne 을 직접 조회해 확정한다(웹훅과 같은 confirmOrderPayment, 멱등). 결제 전이면 verified:false 로 200.
 * PG 승인 실패는 FAILED 로 기록되고, 생성 10분이 지난 결제 대기 주문도 결제 전이면 FAILED 로 바꾼다.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const token = readGuestToken(request.headers);
    if (!token) return apiErrors.notFound(ORDER_NOT_FOUND);

    const order = await prisma.order.findUnique({
      where: { id: params.orderId },
      select: {
        id: true,
        buyerGuestTokenHash: true,
        paymentStatus: true,
        createdAt: true,
        refundFailedAt: true,
        orderNumber: { select: { orderNo: true } },
      },
    });
    if (!order || !order.orderNumber || !verifyGuestToken(token, order.buyerGuestTokenHash)) {
      return apiErrors.notFound(ORDER_NOT_FOUND);
    }

    const result = await confirmOrderPayment(order.id);

    switch (result.kind) {
      case 'PAID':
        return apiSuccess({ verified: true, paymentStatus: ORDER_PAYMENT_STATUS.PAID });
      case 'NOT_PAID': {
        let paymentStatus = result.paymentStatus;
        if (paymentStatus === ORDER_PAYMENT_STATUS.PENDING && isStalePending(order, new Date())) {
          if (await markOrderFailed(prisma, order.id)) paymentStatus = ORDER_PAYMENT_STATUS.FAILED;
        }
        return apiSuccess({ verified: false, paymentStatus });
      }
      case 'STOCK_SHORTAGE':
        return apiError(409, 'STOCK_SHORTAGE', SOLD_OUT_MESSAGE, { soldOutItems: result.soldOutItems });
      case 'CLOSED':
        // 이전 검증·웹훅에서 이미 재고 부족으로 취소(또는 환불 대기)된 주문
        if (result.cancelReason === CANCEL_REASON_STOCK_SHORTAGE) {
          return apiError(409, 'STOCK_SHORTAGE', SOLD_OUT_MESSAGE);
        }
        return apiSuccess({ verified: false, paymentStatus: result.paymentStatus });
      case 'AMOUNT_MISMATCH':
        console.error('[qrshop/verify] payment amount mismatch', { orderId: order.id });
        return apiError(409, 'PAYMENT_AMOUNT_MISMATCH', '결제 금액 불일치');
      case 'NOT_FOUND':
        return apiErrors.notFound(ORDER_NOT_FOUND);
      case 'LOOKUP_FAILED':
        console.error('[qrshop/verify] PortOne lookup failed', { orderId: order.id, code: result.code ?? null });
        return apiErrors.serverError();
    }
  } catch (error) {
    console.error('[qrshop/verify] POST error:', error);
    return apiErrors.serverError();
  }
}
