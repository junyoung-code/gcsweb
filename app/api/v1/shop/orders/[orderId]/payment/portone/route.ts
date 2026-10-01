import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  getPortoneCheckoutPaymentConfig,
  isPortoneCheckoutConfigured,
} from '@/lib/payment/portone';
import { apiError as jsonError } from '@/lib/api-response';

function orderUsesQrShopRedirect(items: Array<{ optionData: unknown }>): boolean {
  return items.some((row) => {
    const d = row.optionData;
    if (!d || typeof d !== 'object') return false;
    return (d as { source?: string }).source === 'qrshop';
  });
}

type Params = { params: { orderId: string } };

/**
 * Buy Now/Fund 주문의 PortOne 결제창 파라미터를 반환한다.
 * 클라이언트는 @portone/browser-sdk requestPayment() 호출에 사용한다.
 */
export async function GET(
  _request: Request,
  { params }: Params,
) {
  try {
    const orderId = params.orderId;
    if (!orderId || typeof orderId !== 'string') {
      return jsonError(400, 'INVALID_INPUT', 'orderId is required.');
    }

    if (!isPortoneCheckoutConfigured()) {
      return jsonError(503, 'PAYMENT_NOT_CONFIGURED', 'PortOne env not set.');
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, productType: { in: [0, 1] }, paymentStatus: 0 },
      select: {
        id: true,
        productType: true,
        paymentMethod: true,
        paymentAmount: true,
        ordererName: true,
        ordererPhone: true,
        user: {
          select: {
            email: true,
          },
        },
        items: {
          select: {
            optionData: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    if (!order) {
      return jsonError(404, 'ORDER_NOT_FOUND', 'order not found or not eligible.');
    }

    if (order.paymentMethod === 3) {
      return jsonError(400, 'COUNTER_PAYMENT_NOT_SUPPORTED', 'counter payment does not require PortOne payment.');
    }

    const { storeId, channelKey } = getPortoneCheckoutPaymentConfig();
    const goodname =
      order.items[0]?.product?.name?.slice(0, 80) ??
      (order.productType === 0 ? 'Fund 주문' : 'Buy Now 주문');

    const baseUrl =
      process.env.NEXTAUTH_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const redirectPath = orderUsesQrShopRedirect(order.items) ? '/QRshop/v1/result' : '/shop/orders/buynow/result';

    // Buy Now에서는 주문자 정보를 수집하지 않으므로 PG 필수값은 서버 기본값으로 보강한다.
    const buyerName = order.ordererName?.trim() || '구매자';
    const buyerTel = order.ordererPhone?.trim() || '01000000000';
    const buyerEmail = order.user?.email?.trim() || 'no-reply@gcsweb.kr';

    return NextResponse.json({
      status: 'success',
      data: {
        storeId,
        channelKey,
        paymentId: order.id,
        orderName: goodname,
        totalAmount: order.paymentAmount,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        redirectUrl: `${baseUrl}${redirectPath}`,
        buyerName,
        buyerTel,
        buyerEmail,
      },
    });
  } catch (error) {
    console.error('PortOne payment params error:', error);
    return jsonError(500, 'SERVER_ERROR', 'server internal error.');
  }
}
