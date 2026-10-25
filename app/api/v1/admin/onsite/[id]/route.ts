import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { formatDateTimePartsInSeoul } from '@/lib/datetime';
import {
  ORDER_PAYMENT_STATUS,
  ORDER_RECEIPT_STATUSES,
  isOnSitePaymentMethod,
  type PaymentMethod,
} from '@/lib/order-status';
import { apiError as jsonError } from '@/lib/api-response';

function toPaymentMethodLabel(paymentMethod: PaymentMethod): string {
  return isOnSitePaymentMethod(paymentMethod) ? '현장결제' : '온라인결제';
}

function normalizeTransactionId(impUid: unknown): string {
  const fallback = '-';
  const raw = typeof impUid === 'string' ? impUid.trim() : '';

  if (!raw) return fallback;

  const cleaned = raw.replace(/\(\s*null\s*\)\s*$/i, '').trim();
  const lowered = cleaned.toLowerCase();
  if (!cleaned || cleaned === '-' || lowered === 'null' || lowered === 'undefined') {
    return fallback;
  }

  return cleaned;
}

type QrshopOptionDataLike = {
  source?: unknown;
  optionValue?: unknown;
};

function parseQrshopLabel(label: string): { itemName: string; optionOnly: string | null } {
  const trimmed = label.trim();
  if (!trimmed) return { itemName: '', optionOnly: null };
  const splitIdx = trimmed.indexOf(' (');
  if (splitIdx < 0 || !trimmed.endsWith(')')) return { itemName: trimmed, optionOnly: null };

  const itemName = trimmed.slice(0, splitIdx).trim();
  const optionOnly = trimmed.slice(splitIdx + 2, -1).trim();

  if (!itemName || !optionOnly) {
    return { itemName: trimmed, optionOnly: null };
  }
  return { itemName, optionOnly };
}

function normalizeOnsiteItemDisplay(item: {
  product?: { name?: string | null; images?: Array<{ thumbnailImgUrl?: string | null }> | null } | null;
  optionData?: unknown;
  id: string;
  price: number;
  quantity: number;
}) {
  const fallbackName = item.product?.name ?? '알 수 없는 상품';
  const optionData = item.optionData;

  if (
    optionData &&
    typeof optionData === 'object' &&
    !Array.isArray(optionData) &&
    (optionData as QrshopOptionDataLike).source === 'qrshop'
  ) {
    const labelRaw = (optionData as QrshopOptionDataLike).optionValue;
    const label = typeof labelRaw === 'string' ? labelRaw : '';
    const parsed = parseQrshopLabel(label);
    const normalizedName = parsed.itemName || fallbackName;

    return {
      id: item.id,
      name: normalizedName,
      option: parsed.optionOnly ? { optionValue: parsed.optionOnly } : null,
      price: item.price,
      quantity: item.quantity,
      imgUrl: item.product?.images?.[0]?.thumbnailImgUrl ?? null,
    };
  }

  return {
    id: item.id,
    name: fallbackName,
    option: optionData ?? null,
    price: item.price,
    quantity: item.quantity,
    imgUrl: item.product?.images?.[0]?.thumbnailImgUrl ?? null,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = params;
    if (!id) return jsonError(400, 'INVALID_INPUT', '주문 ID가 없습니다.');

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return jsonError(404, 'NOT_FOUND', '해당 주문을 찾을 수 없습니다.');
    }

    const { year, month, day, hour, minute } = formatDateTimePartsInSeoul(order.orderDate);
    const YYYY = Number(year);
    const MM = month;
    const DD = day;
    const HH = hour;
    const mm = minute;

    const isCanceled = order.paymentStatus === ORDER_PAYMENT_STATUS.CANCELED;
    const receiptStatus = order.receiptStatus;

    const formattedData = {
      id: order.id,
      orderCode: order.orderCode ?? order.id.slice(-10).toUpperCase(),
      impUid: normalizeTransactionId(order.impUid),
      orderDate: `${YYYY}. ${MM}. ${DD} ${HH}:${mm}`,
      isCanceled,
      paymentStatus: order.paymentStatus,
      bagOption: order.bagOption,
      requiresBagPackaging: order.bagOption === true,
      bagNoticeMessage: order.bagOption === true ? '봉투에 담아주세요' : null,
      items: order.items.map((item) => normalizeOnsiteItemDisplay(item)),
      payment: {
        method: toPaymentMethodLabel(order.paymentMethod),
        amount: `${order.paymentAmount.toLocaleString()}원`,
      },
      receiptStatus,
      actionButtonState: isCanceled ? 'CANCELED' : receiptStatus,
    };

    return NextResponse.json({
      status: 'success',
      data: formattedData,
    });
  } catch (err) {
    console.error('[Admin Onsite Detail GET Error]', err);
    return jsonError(500, 'INTERNAL_SERVER_ERROR', '서버 내부 오류가 발생했습니다.');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = params;
    if (!id) return jsonError(400, 'INVALID_INPUT', '주문 ID가 없습니다.');

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawReceiptStatus = (body as Record<string, unknown>).receiptStatus;
    const rawPaymentStatus = (body as Record<string, unknown>).paymentStatus;

    const receiptStatus = ORDER_RECEIPT_STATUSES.find((value) => value === rawReceiptStatus);
    const paymentStatus = rawPaymentStatus === ORDER_PAYMENT_STATUS.CANCELED ? ORDER_PAYMENT_STATUS.CANCELED : undefined;

    const targetOrder = await prisma.order.findUnique({ where: { id } });
    if (!targetOrder) {
      return jsonError(404, 'NOT_FOUND', '해당 주문을 찾을 수 없습니다.');
    }

    // 주문취소는 비가역 처리
    if (paymentStatus === ORDER_PAYMENT_STATUS.CANCELED) {
      if (targetOrder.paymentStatus === ORDER_PAYMENT_STATUS.CANCELED) {
        return NextResponse.json({ status: 'success', message: '주문취소완료' });
      }

      await prisma.order.update({
        where: { id },
        data: { paymentStatus: ORDER_PAYMENT_STATUS.CANCELED },
      });

      return NextResponse.json({ status: 'success', message: '주문취소완료' });
    }

    if (!receiptStatus) {
      return jsonError(400, 'INVALID_INPUT', '잘못된 수령 상태값입니다.');
    }

    if (targetOrder.paymentStatus === ORDER_PAYMENT_STATUS.CANCELED) {
      return jsonError(400, 'INVALID_INPUT', '주문취소 상태에서는 수령 상태를 변경할 수 없습니다.');
    }

    // 결제상태와 수령상태는 별개 축이다. 수령 여부만 바꾸고 결제상태는 건드리지 않는다.
    await prisma.order.update({
      where: { id },
      data: { receiptStatus },
    });

    return NextResponse.json({
      status: 'success',
      message: '수령 상태가 변경되었습니다.',
    });
  } catch (err) {
    console.error('[Admin Onsite Detail PATCH Error]', err);
    return jsonError(500, 'INTERNAL_SERVER_ERROR', '서버 내부 오류가 발생했습니다.');
  }
}

