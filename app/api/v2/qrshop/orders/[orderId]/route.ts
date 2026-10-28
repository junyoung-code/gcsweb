import type { PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { ORDER_PAYMENT_STATUS } from '@/lib/order-status';
import { readGuestToken, verifyGuestToken } from '@/lib/qrshop/guest-token';
import { CANCEL_REASON_STOCK_SHORTAGE, refreshUnconfirmedOrder } from '@/lib/qrshop/payment-confirm';

export const dynamic = 'force-dynamic';

const ORDER_NOT_FOUND = '존재하지 않는 주문';

type Params = { params: { orderId: string } };

type Failure = { failureCode: string; failureMessage: string } | { failureCode: null; failureMessage: null };

/** 결제 완료가 아닌 주문의 사유 코드와 방문객 안내 문구. 완료 화면은 PAID 일 때만 띄운다. */
function toFailure(order: {
  paymentStatus: PaymentStatus;
  cancelReason: string | null;
  refundFailedAt: Date | null;
}): Failure {
  if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) return { failureCode: null, failureMessage: null };

  // 결제 후 품절로 환불을 시도했으나 환불 호출이 실패해 수동 환불을 기다리는 주문
  if (order.refundFailedAt) {
    return {
      failureCode: 'REFUND_PENDING',
      failureMessage: '해당 상품 품절로 전체 결제 취소 (품절 환불 호출 실패)',
    };
  }

  switch (order.paymentStatus) {
    case ORDER_PAYMENT_STATUS.FAILED:
      return { failureCode: 'PAYMENT_FAILED', failureMessage: '결제가 실패되었습니다.' };
    case ORDER_PAYMENT_STATUS.CANCELED:
      return order.cancelReason === CANCEL_REASON_STOCK_SHORTAGE
        ? { failureCode: 'STOCK_SHORTAGE', failureMessage: '해당 상품 품절로 전체 결제 취소 (품절 환불 호출 성공)' }
        : { failureCode: 'PAYMENT_CANCELED', failureMessage: '결제가 취소되었습니다.' };
    default:
      return { failureCode: 'PAYMENT_NOT_COMPLETED', failureMessage: '결제가 완료되지 않았습니다.' };
  }
}

function findOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerGuestTokenHash: true,
      paymentStatus: true,
      paymentAmount: true,
      cancelReason: true,
      refundFailedAt: true,
      createdAt: true,
      orderNumber: {
        select: { orderNo: true, store: { select: { name: true, storeSlug: true } } },
      },
      items: {
        select: { onsiteProductName: true, onsiteOptionName: true, price: true, quantity: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  });
}

/**
 * 방문객 주문 조회. `X-Guest-Token`이 주문의 토큰 해시와 맞을 때만 보여준다.
 * 주문이 없거나, QR샵 주문이 아니거나(OrderNumber 없음), 토큰이 없거나 틀리면 모두 같은 404로 응답한다.
 *
 * 생성 후 24시간 안의 미확정(PENDING·FAILED) 주문은 먼저 PortOne 으로 실제 결제 여부를 확인해, 결제됐으면 PAID 로 확정한다.
 * 결제 전이면 상태를 바꾸지 않는다(이탈·늦은 결제 대비로 PENDING 유지).
 * 결제 완료가 아닌 주문도 200으로 내려주고 failureCode/failureMessage 로 사유를 알린다.
 * 주문번호는 PAID 일 때만 내려준다(미결제 주문 번호가 화면에 노출되지 않도록).
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const token = readGuestToken(request.headers);
    if (!token) return apiErrors.notFound(ORDER_NOT_FOUND);

    let order = await findOrder(params.orderId);
    if (!order || !order.orderNumber || !verifyGuestToken(token, order.buyerGuestTokenHash)) {
      return apiErrors.notFound(ORDER_NOT_FOUND);
    }

    if (await refreshUnconfirmedOrder(order)) {
      order = (await findOrder(params.orderId)) ?? order;
    }
    if (!order.orderNumber) return apiErrors.notFound(ORDER_NOT_FOUND);

    const isPaid = order.paymentStatus === ORDER_PAYMENT_STATUS.PAID;

    return apiSuccess({
      orderId: order.id,
      orderNo: isPaid ? order.orderNumber.orderNo : null,
      paymentStatus: order.paymentStatus,
      ...toFailure(order),
      orderedAt: order.createdAt.toISOString(),
      paymentAmount: order.paymentAmount,
      store: order.orderNumber.store,
      items: order.items.map((item) => ({
        name: item.onsiteProductName ?? '',
        optionName: item.onsiteOptionName,
        unitPrice: item.price,
        quantity: item.quantity,
      })),
    });
  } catch (error) {
    console.error('[qrshop/orders/:orderId] GET error:', error);
    return apiErrors.serverError();
  }
}
