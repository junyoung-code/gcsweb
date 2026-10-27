import type { Prisma } from '@prisma/client';

/**
 * 방문객 주문 항목 검증: 상점·상품·옵션 소속 확인, 서버 가격 계산, 재고 충분 여부(품절) 판정.
 *
 * 가격은 항상 서버가 계산한다(클라이언트가 보낸 금액은 받지 않는다). 단가 = 상품 기본가 + 옵션 추가금.
 * 재고는 여기서 "충분한지"만 본다. 실제 차감은 결제 확정(payment-confirm)에서 한다.
 */

type Client = Pick<Prisma.TransactionClient, 'store' | 'onsiteProduct'>;

export type OrderItemInput = { productId: string; optionId?: string | null; quantity: number };

export type OrderLine = {
  productId: string;
  optionId: string | null;
  productName: string;
  optionName: string | null;
  unitPrice: number;
  quantity: number;
};

/**
 * 품절·재고 부족 항목. 프론트는 `상품명(옵션명)`으로 표시하고,
 * `availableQuantity`가 0이면 "품절", 0보다 크면 "품절임박 N개"로 안내한다.
 */
export type SoldOutItem = {
  productId: string | null;
  optionId: string | null;
  name: string;
  optionName: string | null;
  /** 현재 남은 재고(요청 수량보다 적음). 상품·옵션이 삭제됐으면 0 */
  availableQuantity: number;
};

export type ValidatedOrder = {
  store: { storeId: string; name: string; storeSlug: string };
  lines: OrderLine[];
  paymentAmount: number;
  orderName: string;
};

export type ValidateOrderResult =
  | ({ ok: true } & ValidatedOrder)
  | {
      ok: false;
      reason: 'STORE_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'OPTION_NOT_FOUND' | 'OPTION_REQUIRED' | 'OPTION_NOT_ALLOWED';
    }
  | { ok: false; reason: 'SOLD_OUT'; soldOutItems: SoldOutItem[] };

/** 같은 상품·옵션이 여러 행으로 오면 수량을 합산한다. 처음 나온 순서를 유지한다. */
export function mergeOrderItems(items: OrderItemInput[]): Required<OrderItemInput>[] {
  const merged = new Map<string, Required<OrderItemInput>>();
  for (const item of items) {
    const optionId = item.optionId ?? null;
    const key = `${item.productId}\u0000${optionId ?? ''}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(key, { productId: item.productId, optionId, quantity: item.quantity });
    }
  }
  return [...merged.values()];
}

/** 결제창에 표시할 주문명. 예: `키캡키링 A. 씩씩부처 외 1건` */
export function buildOrderName(lines: Pick<OrderLine, 'productName'>[]): string {
  const [first] = lines;
  if (!first) return '';
  return lines.length > 1 ? `${first.productName} 외 ${lines.length - 1}건` : first.productName;
}

export async function validateOrderItems(
  client: Client,
  params: { storeSlug: string; items: OrderItemInput[] },
): Promise<ValidateOrderResult> {
  const store = await client.store.findUnique({
    where: { storeSlug: params.storeSlug },
    select: { storeId: true, name: true, storeSlug: true },
  });
  if (!store) return { ok: false, reason: 'STORE_NOT_FOUND' };

  const items = mergeOrderItems(params.items);
  const products = await client.onsiteProduct.findMany({
    where: { storeId: store.storeId, productId: { in: [...new Set(items.map((item) => item.productId))] } },
    select: {
      productId: true,
      name: true,
      price: true,
      hasOption: true,
      currentStock: true,
      options: { select: { optionId: true, name: true, surcharge: true, currentStock: true } },
    },
  });
  const productById = new Map(products.map((product) => [product.productId, product]));

  const lines: OrderLine[] = [];
  const soldOutItems: SoldOutItem[] = [];

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) return { ok: false, reason: 'PRODUCT_NOT_FOUND' };

    let optionName: string | null = null;
    let surcharge = 0;
    let stock = product.currentStock;

    if (product.hasOption) {
      if (!item.optionId) return { ok: false, reason: 'OPTION_REQUIRED' };
      const option = product.options.find((candidate) => candidate.optionId === item.optionId);
      if (!option) return { ok: false, reason: 'OPTION_NOT_FOUND' };
      optionName = option.name;
      surcharge = option.surcharge;
      stock = option.currentStock;
    } else if (item.optionId) {
      return { ok: false, reason: 'OPTION_NOT_ALLOWED' };
    }

    if (stock < item.quantity) {
      soldOutItems.push({
        productId: product.productId,
        optionId: item.optionId,
        name: product.name,
        optionName,
        availableQuantity: Math.max(stock, 0),
      });
    }

    lines.push({
      productId: product.productId,
      optionId: item.optionId,
      productName: product.name,
      optionName,
      unitPrice: product.price + surcharge,
      quantity: item.quantity,
    });
  }

  if (soldOutItems.length > 0) return { ok: false, reason: 'SOLD_OUT', soldOutItems };

  const paymentAmount = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return { ok: true, store, lines, paymentAmount, orderName: buildOrderName(lines) };
}
