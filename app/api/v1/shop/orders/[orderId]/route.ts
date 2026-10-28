import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import crypto from 'crypto';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeImageUrl } from '@/lib/image-url';
import { apiError as jsonError } from '@/lib/api-response';
import { formatPrice } from '@/lib/utils';
import { toOrderReceiptStatusLabel } from '@/lib/order-status';

function hashGuestToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

type Params = {
  params: { orderId: string };
};

type OptionLike = {
  value?: unknown;
  optionValue?: unknown;
  optionName?: unknown;
  name?: unknown;
};

function extractOptionValues(optionData: unknown): string[] {
  if (Array.isArray(optionData)) {
    return optionData
      .map((row) => {
        if (row && typeof row === 'object') {
          const option = row as OptionLike;
          const candidate = option.optionValue ?? option.value ?? option.optionName ?? option.name ?? '';
          return String(candidate).trim();
        }
        if (typeof row === 'string') return row.trim();
        return '';
      })
      .filter(Boolean);
  }

  if (optionData && typeof optionData === 'object') {
    return extractOptionValues([optionData]);
  }

  if (typeof optionData === 'string') {
    const trimmed = optionData.trim();
    if (!trimmed) return [];
    try {
      return extractOptionValues(JSON.parse(trimmed));
    } catch {
      return [trimmed];
    }
  }

  return [];
}

function toOptionQuantityText(optionData: unknown, quantity: number): string {
  const values = extractOptionValues(optionData);
  if (values.length === 0) return `${quantity}개`;
  return `${values.join(' / ')} / ${quantity}개`;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email ?? null;

    let user: { id: string } | null = null;
    if (sessionEmail) {
      user = await prisma.user.findFirst({ where: { email: sessionEmail },
        select: { id: true },
      });
    }

    const orderId = params.orderId;
    if (!orderId || typeof orderId !== 'string') {
      return jsonError(400, 'INVALID_INPUT', 'orderId is required.');
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
      },
      select: {
        id: true,
        orderNumber: { select: { orderNo: true } },
        userId: true,
        buyerType: true,
        buyerGuestTokenHash: true,
        productType: true,
        receiveMethod: true,
        receiverName: true,
        receiverPhone: true,
        deliveryZipCode: true,
        deliveryAddressMain: true,
        deliveryAddressDetail: true,
        deliveryMessage: true,
        ordererName: true,
        ordererPhone: true,
        paymentMethod: true,
        cardCompany: true,
        bankCode: true,
        easyPayProvider: true,
        paymentStatus: true,
        receiptStatus: true,
        paymentAmount: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            price: true,
            optionData: true,
            product: {
              select: {
                name: true,
                team: { select: { teamName: true } },
                images: { select: { thumbnailImgUrl: true }, take: 1 },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return jsonError(404, 'ORDER_NOT_FOUND', 'order not found.');
    }

    if (order.buyerType === 'USER') {
      if (!user || order.userId !== user.id) {
        return jsonError(404, 'ORDER_NOT_FOUND', 'order not found.');
      }
    } else {
      const rawGuestToken = request.headers.get('x-guest-token')?.trim() ?? '';
      if (!rawGuestToken) {
        return jsonError(400, 'GUEST_TOKEN_REQUIRED', 'x-guest-token is required for guest order.');
      }
      const hashedGuestToken = hashGuestToken(rawGuestToken);
      if (!order.buyerGuestTokenHash || order.buyerGuestTokenHash !== hashedGuestToken) {
        return jsonError(404, 'ORDER_NOT_FOUND', 'order not found.');
      }
    }

    const { buyerGuestTokenHash: _buyerGuestTokenHash, orderNumber, ...safeOrder } = order;
    const receiptLabel = toOrderReceiptStatusLabel(order.receiptStatus);

    const mappedItems = order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
      optionData: item.optionData,
      productName: item.product?.name ?? '상품',
      teamName: item.product?.team?.teamName ?? '',
      thumbnailUrl: normalizeImageUrl(item.product?.images?.[0]?.thumbnailImgUrl ?? null) ?? '',
      optionText: toOptionQuantityText(item.optionData, item.quantity),
      priceText: formatPrice((item.price ?? 0) * (item.quantity ?? 1)),
      receiptLabel,
    }));

    return NextResponse.json({
      status: 'success',
      data: {
        order: {
          ...safeOrder,
          orderNo: orderNumber?.orderNo ?? null,
          items: mappedItems,
        },
      },
    });
  } catch (error) {
    console.error('Shop order detail error:', error);
    return jsonError(500, 'SERVER_ERROR', 'server internal error.');
  }
}
