import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { chargeWithBillingKey } from '@/lib/payment/portone';
import { apiError as jsonError } from '@/lib/api-response';
import { ORDER_PAYMENT_STATUS } from '@/lib/order-status';

type Params = { params: { orderId: string } };

/** Fund 주문 빌링키 결제 (포트원) */
export async function POST(request: Request, { params }: Params) {
  try {
    const orderId = params.orderId;
    if (!orderId || typeof orderId !== 'string') {
      return jsonError(400, 'INVALID_INPUT', 'orderId is required.');
    }

    const body = await request.json().catch(() => ({}));
    const billingKey = typeof body.billingKey === 'string' ? body.billingKey.trim() : '';
    if (!billingKey) {
      return jsonError(400, 'INVALID_INPUT', 'billingKey is required.');
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        productType: 0,
        paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
      },
      select: {
        id: true,
        paymentAmount: true,
        ordererName: true,
        ordererPhone: true,
        items: {
          take: 1,
          select: {
            product: { select: { name: true } },
          },
        },
      },
    });

    if (!order) {
      return jsonError(404, 'ORDER_NOT_FOUND', 'order not found or not eligible.');
    }

    const goodname = order.items[0]?.product?.name?.slice(0, 80) ?? 'Fund 주문';

    const result = await chargeWithBillingKey({
      paymentId: order.id,
      billingKey,
      orderName: goodname,
      totalAmount: order.paymentAmount,
      customerName: order.ordererName ?? undefined,
      customerMobile: order.ordererPhone ?? undefined,
    });

    if (!result.success) {
      return NextResponse.json({
        status: 'success',
        data: {
          paymentConfirmed: false,
          code: result.code,
          message: result.message,
        },
      });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: ORDER_PAYMENT_STATUS.PAID,
        impUid: result.impUid,
      },
    });

    return NextResponse.json({
      status: 'success',
      data: { paymentConfirmed: true },
    });
  } catch (error) {
    console.error('PortOne billing error:', error);
    return jsonError(500, 'SERVER_ERROR', 'server internal error.');
  }
}
