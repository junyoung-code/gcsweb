import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { formatDateTimePartsInSeoul } from '@/lib/datetime';
import {
  ORDER_ADMIN_PAYMENT_COMPLETED_LABEL,
  ORDER_PAYMENT_METHOD,
  ORDER_PAYMENT_STATUSES,
  isOnSitePaymentMethod,
  type PaymentMethod,
  type PaymentStatus,
  type ReceiptStatus,
  toOrderPaymentStatusLabel,
  toOrderReceiptStatusLabel,
} from '@/lib/order-status';
import { apiError as jsonError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

type OptionLike = {
  value?: unknown;
  optionValue?: unknown;
  source?: unknown;
};

type MappedOrderItem = {
  id: string;
  name: string;
  options: string;
  price: number;
  quantity: number;
};

type MappedOrder = {
  id: string;
  productType: number;
  paymentStatusCode: PaymentStatus;
  receiptStatusCode: ReceiptStatus;
  orderId: string;
  orderTime: string;
  fullOrderTime: string;
  orderDateRaw: string;
  paymentStatus: string;
  paymentMethodStr: string;
  paymentAmount: number;
  receiptStatus: string;
  impUid: string;
  bagOption: boolean;
  requiresBagPackaging: boolean;
  bagNoticeMessage: string | null;
  orderSource: 'QRSHOP' | 'SHOP';
  items: MappedOrderItem[];
};

function isQrShopOrder(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((item) => {
    const optionData = (item as { optionData?: unknown } | null)?.optionData;
    if (!optionData || typeof optionData !== 'object' || Array.isArray(optionData)) return false;
    const source = (optionData as { source?: unknown }).source;
    return source === 'qrshop';
  });
}

function extractOptionValues(optionData: unknown): string[] {
  if (Array.isArray(optionData)) {
    return optionData
      .map((row) => {
        if (row && typeof row === 'object') {
          const option = row as OptionLike;
          const candidate = option.optionValue ?? option.value ?? '';
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
  return `${values.join(' · ')} / ${quantity}개`;
}

function parseQrshopLabel(label: string): { itemName: string; optionOnly: string | null } {
  const trimmed = label.trim();
  if (!trimmed) return { itemName: '', optionOnly: null };
  const splitIdx = trimmed.indexOf(' (');
  if (splitIdx < 0 || !trimmed.endsWith(')')) return { itemName: trimmed, optionOnly: null };

  const itemName = trimmed.slice(0, splitIdx).trim();
  const optionOnly = trimmed.slice(splitIdx + 2, -1).trim();
  if (!itemName || !optionOnly) return { itemName: trimmed, optionOnly: null };
  return { itemName, optionOnly };
}

function mapOnsiteOrderItem(item: any): MappedOrderItem {
  const quantity = Number(item.quantity ?? 1);
  const fallbackName = String(item.product?.name ?? '알 수 없는 상품');
  const optionData = item.optionData;

  if (optionData && typeof optionData === 'object' && !Array.isArray(optionData)) {
    const optionObj = optionData as OptionLike;
    if (optionObj.source === 'qrshop') {
      const label = typeof optionObj.optionValue === 'string' ? optionObj.optionValue : '';
      const parsed = parseQrshopLabel(label);
      const name = parsed.itemName || fallbackName;
      const options = parsed.optionOnly ? `${parsed.optionOnly} / ${quantity}개` : `${quantity}개`;
      return {
        id: String(item.id ?? ''),
        name,
        options,
        price: Number(item.price ?? 0),
        quantity,
      };
    }
  }

  return {
    id: String(item.id ?? ''),
    name: fallbackName,
    options: toOptionQuantityText(optionData, quantity),
    price: Number(item.price ?? 0),
    quantity,
  };
}

function toPaymentMethodLabel(paymentMethod: PaymentMethod) {
  return isOnSitePaymentMethod(paymentMethod) ? '현장결제' : '온라인결제';
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() ?? '';
    const sourceFilter = (searchParams.get('source')?.trim().toLowerCase() ?? 'all') as
      | 'all'
      | 'qrshop'
      | 'shop';
    const payMethod = (searchParams.get('payMethod')?.trim().toLowerCase() ?? 'all') as
      | 'all'
      | 'online'
      | 'counter';
    const payOutcome = (searchParams.get('payOutcome')?.trim().toLowerCase() ?? 'all') as
      | 'all'
      | 'completed'
      | 'other';

    const where: any = {
      productType: 1,
      receiveMethod: 1,
      paymentStatus: { in: [...ORDER_PAYMENT_STATUSES] },
    };

    if (payMethod === 'online') {
      where.paymentMethod = ORDER_PAYMENT_METHOD.ONLINE;
    } else if (payMethod === 'counter') {
      where.paymentMethod = ORDER_PAYMENT_METHOD.ON_SITE;
    }

    if (search) {
      where.OR = [
        { orderCode: { contains: search, mode: 'insensitive' } },
        { impUid: { contains: search, mode: 'insensitive' } },
      ];
    }

    const query: any = {
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { orderDate: 'desc' },
    };

    const orders = (await prisma.order.findMany(query)) as any[];

    const mappedData: MappedOrder[] = orders.map((order) => {
      const { year, month, day, hour, minute } = formatDateTimePartsInSeoul(order.orderDate);
      const YY = year.slice(-2);
      const MM = month;
      const DD = day;
      const HH = hour;
      const mm = minute;

      const paymentStatusCode: PaymentStatus = order.paymentStatus;
      const receiptStatusCode: ReceiptStatus = order.receiptStatus;
      const paymentMethodCode: PaymentMethod = order.paymentMethod;

      const orderDate =
        order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate as string);

      const paymentStatus = toOrderPaymentStatusLabel({
        paymentMethod: paymentMethodCode,
        paymentStatus: paymentStatusCode,
        orderDate,
      });
      const receiptStatus = toOrderReceiptStatusLabel(receiptStatusCode);

      const items: MappedOrderItem[] = Array.isArray(order.items)
        ? order.items.map((item: any) => mapOnsiteOrderItem(item))
        : [];

      const hasBagOption = order.bagOption === true;

      const orderSource: 'QRSHOP' | 'SHOP' = isQrShopOrder(order.items) ? 'QRSHOP' : 'SHOP';

      return {
        id: String(order.id),
        productType: Number(order.productType ?? 1),
        paymentStatusCode,
        receiptStatusCode,
        orderId: String(order.orderCode ?? String(order.id ?? '').slice(-10).toUpperCase()),
        orderTime: `${HH}:${mm}`,
        fullOrderTime: `${YY}.${MM}.${DD} ${HH}:${mm}`,
        orderDateRaw: `${parseInt(MM, 10)}월 ${parseInt(DD, 10)}일`,
        paymentStatus,
        paymentMethodStr: toPaymentMethodLabel(paymentMethodCode),
        paymentAmount: Number(order.paymentAmount ?? 0),
        receiptStatus,
        impUid: typeof order.impUid === 'string' && order.impUid.trim() ? order.impUid.trim() : '-',
        bagOption: hasBagOption,
        requiresBagPackaging: hasBagOption,
        bagNoticeMessage: hasBagOption ? '봉투에 담아주세요' : null,
        orderSource,
        items,
      };
    });

    const sourceFilteredData = mappedData.filter((row) => {
      if (sourceFilter === 'all') return true;
      if (sourceFilter === 'qrshop') return row.orderSource === 'QRSHOP';
      if (sourceFilter === 'shop') return row.orderSource === 'SHOP';
      return true;
    });

    const outcomeFilteredData = sourceFilteredData.filter((row) => {
      if (payOutcome === 'completed') return row.paymentStatus === ORDER_ADMIN_PAYMENT_COMPLETED_LABEL;
      if (payOutcome === 'other') return row.paymentStatus !== ORDER_ADMIN_PAYMENT_COMPLETED_LABEL;
      return true;
    });

    const grouped = outcomeFilteredData.reduce(
      (acc, curr) => {
        const found = acc.find((x) => x.date === curr.orderDateRaw);
        if (found) found.items.push(curr);
        else acc.push({ date: curr.orderDateRaw, items: [curr] });
        return acc;
      },
      [] as { date: string; items: MappedOrder[] }[]
    );

    return NextResponse.json({ status: 'success', data: grouped });
  } catch (err) {
    console.error('[Admin Onsite List GET Error]', err);
    return jsonError(500, 'INTERNAL_SERVER_ERROR', '서버 내부 오류가 발생했습니다.');
  }
}

