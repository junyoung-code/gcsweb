import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getPayment } from '@/lib/payment/portone';
import { apiError as jsonError } from '@/lib/api-response';
import { ORDER_PAYMENT_STATUS } from '@/lib/order-status';

type Params = { params: { orderId: string } };


/**
 * 포트원 결제 결과 검증.
 * 결제창 리다이렉트 후 클라이언트에서 paymentId로 호출.
 * 금액 일치·상태 확인 후 paymentStatus를 PAID로 갱신.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const orderId = params.orderId;
    if (!orderId || typeof orderId !== 'string') {
      return jsonError(400, 'INVALID_INPUT', 'orderId is required.');
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, productType: { in: [0, 1] } },
      select: {
        id: true,
        orderCode: true,
        paymentAmount: true,
        paymentStatus: true,
        paymentMethod: true,
      },
    });

    if (!order) {
      return jsonError(404, 'ORDER_NOT_FOUND', 'order not found.');
    }

    if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) {
      return NextResponse.json({
        status: 'success',
        data: { verified: true, alreadyPaid: true },
      });
    }

    const payment = await getPayment(orderId);
    if (!payment.success || !payment.amount || !payment.status) {
      console.error('[PortOne][verify] Verification lookup failed', {
        orderId,
        paymentSuccess: payment.success,
        paymentStatus: payment.status ?? null,
        amountTotal: payment.amount?.total ?? null,
        code: payment.code ?? null,
        message: payment.message ?? null,
      });
      return NextResponse.json({
        status: 'success',
        data: {
          verified: false,
          code: payment.code,
          message: payment.message ?? '결제 확인 실패',
        },
      });
    }

    const expectedTotal = order.paymentAmount;
    const actualTotal = payment.amount?.total ?? 0;
    if (actualTotal !== expectedTotal) {
      console.error('[PortOne][verify] Amount mismatch', {
        orderId,
        expectedTotal,
        actualTotal,
        paymentStatus: payment.status,
      });
      return NextResponse.json({
        status: 'success',
        data: {
          verified: false,
          message: '결제 금액이 일치하지 않습니다.',
        },
      });
    }

    const paid =
      payment.status?.toUpperCase() === 'PAID' ||
      payment.status?.toUpperCase() === 'VIRTUAL_ACCOUNT_ISSUED';

    if (!paid) {
      console.warn('[PortOne][verify] Payment not yet paid', {
        orderId,
        paymentStatus: payment.status,
      });
      return NextResponse.json({
        status: 'success',
        data: {
          verified: false,
          status: payment.status,
        },
      });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: ORDER_PAYMENT_STATUS.PAID, impUid: payment.impUid },
    });

    return NextResponse.json({
      status: 'success',
      data: {
        verified: true,
        status: payment.status,
      },
    });
  } catch (error) {
    console.error('PortOne verify error:', error);
    return jsonError(500, 'SERVER_ERROR', 'server internal error.');
  }
}
