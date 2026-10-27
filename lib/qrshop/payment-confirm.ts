import type { PaymentStatus, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ORDER_PAYMENT_STATUS } from '@/lib/order-status';
import { cancelPayment, getPayment } from '@/lib/payment/portone';
import type { SoldOutItem } from './order-validation';

/**
 * QR샵 주문 결제 확정. 결제 검증 API(verify)와 PortOne 웹훅이 같은 함수를 호출한다.
 *
 * 1) PortOne 을 직접 조회해 금액·결제 여부를 확인한다(요청 값은 신뢰하지 않는다).
 * 2) 한 트랜잭션에서 주문 행을 잠근 뒤 재고를 조건부로 차감하고 PAID 로 바꾼다.
 *    이미 PAID 면 아무것도 하지 않는다(멱등) — verify 와 웹훅이 동시에 와도 한쪽만 처리된다.
 * 3) 결제는 됐는데 재고가 모자라면 트랜잭션이 롤백되고 전액 환불한 뒤 CANCELED 로 기록한다.
 *    환불 호출이 실패하면 refundFailedAt 을 남겨 수동 처리 대상으로 표시한다.
 *
 * FAILED 주문도 확정 대상이다. 결제창이 오래 걸려 시간 초과로 FAILED 가 된 뒤에 결제가 완료될 수 있고
 * (앱카드·간편결제 인증 등), 그때 고객은 이미 돈을 냈으므로 정상 주문으로 살린다.
 *
 * PortOne 결제 ID 는 주문 ID(Order.id)와 같다.
 */
export const CANCEL_REASON_STOCK_SHORTAGE = 'STOCK_SHORTAGE';
const REFUND_REASON_STOCK_SHORTAGE = '재고 부족으로 인한 자동 환불';

/** 결제 확정으로 PAID 가 될 수 있는 상태. CANCELED 는 환불까지 끝난 주문이라 제외한다. */
const CONFIRMABLE_STATUSES: PaymentStatus[] = [ORDER_PAYMENT_STATUS.PENDING, ORDER_PAYMENT_STATUS.FAILED];

function isConfirmable(status: PaymentStatus): boolean {
  return CONFIRMABLE_STATUSES.includes(status);
}

/** 결제 대기 주문을 결제창 이탈로 보고 FAILED 로 바꾸는 기준 시간(주문 생성 후). */
export const PENDING_EXPIRE_MS = 10 * 60 * 1000;

export type ConfirmResult =
  | { kind: 'PAID'; alreadyPaid: boolean }
  /** 결제 전(결제창 미완료·이탈 포함). 주문은 PENDING 그대로 */
  | { kind: 'NOT_PAID'; paymentStatus: PaymentStatus; portoneStatus?: string }
  | { kind: 'AMOUNT_MISMATCH' }
  | { kind: 'STOCK_SHORTAGE'; soldOutItems: SoldOutItem[]; refunded: boolean }
  /** 이미 취소·실패로 끝난 주문 */
  | { kind: 'CLOSED'; paymentStatus: PaymentStatus; cancelReason: string | null }
  | { kind: 'NOT_FOUND' }
  | { kind: 'LOOKUP_FAILED'; code?: string; message?: string };

export type ConfirmDeps = {
  db: PrismaClient;
  getPayment: typeof getPayment;
  cancelPayment: typeof cancelPayment;
  now: () => Date;
};

type StockItem = {
  quantity: number;
  onsiteProductId: string | null;
  onsiteOptionId: string | null;
  onsiteProductName: string | null;
  onsiteOptionName: string | null;
};

class StockShortageError extends Error {
  constructor(readonly soldOutItems: SoldOutItem[]) {
    super(CANCEL_REASON_STOCK_SHORTAGE);
  }
}

/**
 * 항목별로 재고를 조건부 차감한다(`현재 재고 >= 수량`). 옵션 상품은 옵션과 상품 재고(= 옵션 합계)를 함께 줄인다.
 * 상품·옵션이 삭제돼 FK 가 비어 있는 항목은 품절로 본다. 모자란 항목을 모아서 돌려준다(호출 쪽이 롤백한다).
 */
async function decrementStock(tx: Prisma.TransactionClient, items: StockItem[]): Promise<SoldOutItem[]> {
  const soldOut: SoldOutItem[] = [];

  for (const item of items) {
    const shortage = (availableQuantity: number): SoldOutItem => ({
      productId: item.onsiteProductId,
      optionId: item.onsiteOptionId,
      name: item.onsiteProductName ?? '',
      optionName: item.onsiteOptionName,
      availableQuantity: Math.max(availableQuantity, 0),
    });

    const deletedOption = item.onsiteOptionName !== null && item.onsiteOptionId === null;
    if (item.onsiteProductId === null || deletedOption) {
      soldOut.push(shortage(0));
      continue;
    }

    if (item.onsiteOptionId !== null) {
      const option = await tx.onsiteProductOption.updateMany({
        where: { optionId: item.onsiteOptionId, currentStock: { gte: item.quantity } },
        data: { currentStock: { decrement: item.quantity } },
      });
      if (option.count !== 1) {
        const current = await tx.onsiteProductOption.findUnique({
          where: { optionId: item.onsiteOptionId },
          select: { currentStock: true },
        });
        soldOut.push(shortage(current?.currentStock ?? 0));
        continue;
      }
    }

    const product = await tx.onsiteProduct.updateMany({
      where: { productId: item.onsiteProductId, currentStock: { gte: item.quantity } },
      data: { currentStock: { decrement: item.quantity } },
    });
    if (product.count !== 1) {
      const current = await tx.onsiteProduct.findUnique({
        where: { productId: item.onsiteProductId },
        select: { currentStock: true },
      });
      soldOut.push(shortage(current?.currentStock ?? 0));
    }
  }

  return soldOut;
}

export async function confirmOrderPayment(orderId: string, overrides: Partial<ConfirmDeps> = {}): Promise<ConfirmResult> {
  const deps: ConfirmDeps = {
    db: prisma,
    getPayment,
    cancelPayment,
    now: () => new Date(),
    ...overrides,
  };
  const { db } = deps;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      paymentStatus: true,
      paymentAmount: true,
      cancelReason: true,
      orderNumber: { select: { type: true } },
      items: {
        select: {
          quantity: true,
          onsiteProductId: true,
          onsiteOptionId: true,
          onsiteProductName: true,
          onsiteOptionName: true,
        },
      },
    },
  });
  // OrderNumber 가 없으면 QR샵 주문이 아니다.
  if (!order || !order.orderNumber) return { kind: 'NOT_FOUND' };

  if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) return { kind: 'PAID', alreadyPaid: true };
  if (!isConfirmable(order.paymentStatus)) {
    return { kind: 'CLOSED', paymentStatus: order.paymentStatus, cancelReason: order.cancelReason };
  }

  const payment = await deps.getPayment(order.id);
  if (!payment.success) {
    if (payment.notFound) return { kind: 'NOT_PAID', paymentStatus: order.paymentStatus };
    return { kind: 'LOOKUP_FAILED', code: payment.code, message: payment.message };
  }
  if (payment.amount?.total !== order.paymentAmount) return { kind: 'AMOUNT_MISMATCH' };
  if (payment.status?.toUpperCase() !== 'PAID') {
    return { kind: 'NOT_PAID', paymentStatus: order.paymentStatus, portoneStatus: payment.status };
  }

  try {
    const result = await db.$transaction(
      async (tx): Promise<ConfirmResult> => {
        // 같은 주문을 verify·웹훅이 동시에 처리하지 않도록 주문 행을 잠그고 상태를 다시 읽는다.
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;
        const current = await tx.order.findUnique({
          where: { id: order.id },
          select: { paymentStatus: true, cancelReason: true },
        });
        if (!current) return { kind: 'NOT_FOUND' };
        if (current.paymentStatus === ORDER_PAYMENT_STATUS.PAID) return { kind: 'PAID', alreadyPaid: true };
        if (!isConfirmable(current.paymentStatus)) {
          return { kind: 'CLOSED', paymentStatus: current.paymentStatus, cancelReason: current.cancelReason };
        }

        const soldOut = await decrementStock(tx, order.items);
        if (soldOut.length > 0) throw new StockShortageError(soldOut);

        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: ORDER_PAYMENT_STATUS.PAID,
            ...(payment.impUid ? { impUid: payment.impUid } : {}),
          },
        });
        return { kind: 'PAID', alreadyPaid: false };
      },
      { timeout: 15000 },
    );
    return result;
  } catch (error) {
    if (!(error instanceof StockShortageError)) throw error;
    return refundForStockShortage(deps, order.id, error.soldOutItems);
  }
}

/** 재고 부족으로 확정하지 못한 결제를 전액 환불하고 주문을 취소 처리한다. */
async function refundForStockShortage(
  deps: ConfirmDeps,
  orderId: string,
  soldOutItems: SoldOutItem[],
): Promise<ConfirmResult> {
  const refund = await deps.cancelPayment({ paymentId: orderId, reason: REFUND_REASON_STOCK_SHORTAGE });
  const now = deps.now();

  if (refund.success) {
    await deps.db.order.updateMany({
      where: { id: orderId, paymentStatus: { in: CONFIRMABLE_STATUSES } },
      data: {
        paymentStatus: ORDER_PAYMENT_STATUS.CANCELED,
        canceledAt: now,
        cancelReason: CANCEL_REASON_STOCK_SHORTAGE,
      },
    });
    return { kind: 'STOCK_SHORTAGE', soldOutItems, refunded: true };
  }

  console.error('[qrshop][confirm] refund failed after stock shortage', {
    orderId,
    code: refund.code ?? null,
    message: refund.message ?? null,
  });
  await deps.db.order.updateMany({
    where: { id: orderId, paymentStatus: { in: CONFIRMABLE_STATUSES } },
    data: { refundFailedAt: now, cancelReason: CANCEL_REASON_STOCK_SHORTAGE },
  });
  return { kind: 'STOCK_SHORTAGE', soldOutItems, refunded: false };
}

/**
 * 결제창 이탈 판정. 주문 조회·결제 검증에서 먼저 호출한다(크론 없이 조회 시점에 판정).
 *
 * 생성 후 PENDING_EXPIRE_MS 가 지난 PENDING 주문이면 PortOne 에 실제 결제 여부를 확인한다.
 * 결제됐으면 확정(confirmOrderPayment)하고, 결제 전이면 FAILED 로 바꾼다. 조회 실패·금액 불일치는 그대로 둔다.
 * 환불 실패로 수동 처리 대기 중인 주문(refundFailedAt)은 건드리지 않는다.
 *
 * 상태가 바뀌었으면 true 를 돌려준다(호출 쪽이 주문을 다시 읽는다).
 */
export async function settleStalePendingOrder(
  order: { id: string; paymentStatus: PaymentStatus; createdAt: Date; refundFailedAt: Date | null },
  overrides: Partial<ConfirmDeps> = {},
): Promise<boolean> {
  const deps: ConfirmDeps = {
    db: prisma,
    getPayment,
    cancelPayment,
    now: () => new Date(),
    ...overrides,
  };

  if (order.paymentStatus !== ORDER_PAYMENT_STATUS.PENDING || order.refundFailedAt) return false;
  if (deps.now().getTime() - order.createdAt.getTime() < PENDING_EXPIRE_MS) return false;

  const result = await confirmOrderPayment(order.id, deps);
  if (result.kind === 'NOT_PAID') {
    const expired = await deps.db.order.updateMany({
      where: { id: order.id, paymentStatus: ORDER_PAYMENT_STATUS.PENDING, refundFailedAt: null },
      data: { paymentStatus: ORDER_PAYMENT_STATUS.FAILED },
    });
    return expired.count > 0;
  }
  return result.kind === 'PAID' || result.kind === 'STOCK_SHORTAGE';
}
