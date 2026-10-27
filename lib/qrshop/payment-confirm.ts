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

/**
 * 주문 조회 시 미확정 주문의 결제 여부를 PortOne 에 다시 확인하는 기간(주문 생성 후).
 * 결제창 이탈·늦은 결제(앱카드·간편결제 인증 등)는 PENDING 으로 두고, 이 기간 안에 결제가 오면 PAID 로 확정한다.
 * 기간이 지나면 조회만으로는 확인하지 않는다(PortOne 호출이 무한정 반복되지 않도록). 웹훅·결제 검증은 기간과 무관하다.
 */
export const PAYMENT_CHECK_WINDOW_MS = 24 * 60 * 60 * 1000;

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
      refundFailedAt: true,
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
  // 재고 부족 환불이 실패해 수동 환불을 기다리는 주문은 다시 확정하지 않는다(고객에게 환불 예정으로 안내됨).
  if (!isConfirmable(order.paymentStatus) || order.refundFailedAt) {
    return { kind: 'CLOSED', paymentStatus: order.paymentStatus, cancelReason: order.cancelReason };
  }

  const payment = await deps.getPayment(order.id);
  if (!payment.success) {
    if (payment.notFound) return { kind: 'NOT_PAID', paymentStatus: order.paymentStatus };
    return { kind: 'LOOKUP_FAILED', code: payment.code, message: payment.message };
  }
  const portoneStatus = payment.status?.toUpperCase();
  if (portoneStatus !== 'PAID') {
    // PG 승인 실패는 바로 FAILED 로 기록한다. 같은 결제 ID 로 재결제가 가능하므로 이후 PAID 가 오면 다시 확정된다.
    if (portoneStatus === 'FAILED' && order.paymentStatus === ORDER_PAYMENT_STATUS.PENDING) {
      await markOrderFailed(db, order.id);
      return { kind: 'NOT_PAID', paymentStatus: ORDER_PAYMENT_STATUS.FAILED, portoneStatus: payment.status };
    }
    return { kind: 'NOT_PAID', paymentStatus: order.paymentStatus, portoneStatus: payment.status };
  }
  if (payment.amount?.total !== order.paymentAmount) return { kind: 'AMOUNT_MISMATCH' };

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
 * 주문 조회에서 먼저 호출하는 미확정 주문 확인(크론 없이 조회 시점에 반영).
 *
 * 생성 후 PAYMENT_CHECK_WINDOW_MS 안의 PENDING·FAILED 주문이면 PortOne 에 실제 결제 여부를 확인하고,
 * 결제됐으면 확정(confirmOrderPayment)한다. 결제 전이면 아무것도 바꾸지 않는다(타임아웃으로 FAILED 를 만들지 않는다).
 * PG 승인 실패가 확인된 경우만 FAILED 로 기록된다(confirmOrderPayment 가 처리).
 * 조회 실패·금액 불일치는 그대로 둔다. 환불 실패로 수동 처리 대기 중인 주문(refundFailedAt)은 건드리지 않는다.
 *
 * 상태가 바뀌었으면 true 를 돌려준다(호출 쪽이 주문을 다시 읽는다).
 */
export async function refreshUnconfirmedOrder(
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

  if (!isPaymentCheckable(order, deps.now())) return false;

  const result = await confirmOrderPayment(order.id, deps);
  switch (result.kind) {
    case 'NOT_PAID':
      return result.paymentStatus !== order.paymentStatus;
    case 'PAID':
    case 'STOCK_SHORTAGE':
    case 'CLOSED': // 확인하는 사이 다른 요청이 상태를 바꿨다
      return true;
    default:
      return false;
  }
}

/** 조회 시 PortOne 에 확인할 주문인지: 미확정(PENDING·FAILED)이고, 환불 실패 대기가 아니며, 생성 후 24시간 안. */
export function isPaymentCheckable(
  order: { paymentStatus: PaymentStatus; createdAt: Date; refundFailedAt: Date | null },
  now: Date,
): boolean {
  if (!isConfirmable(order.paymentStatus) || order.refundFailedAt) return false;
  return now.getTime() - order.createdAt.getTime() < PAYMENT_CHECK_WINDOW_MS;
}

/** 결제 대기 주문을 FAILED 로 바꾼다(PG 승인 실패 확인 시). 다른 요청이 먼저 상태를 바꿨으면 건드리지 않는다. */
async function markOrderFailed(db: Pick<PrismaClient, 'order'>, orderId: string): Promise<boolean> {
  const updated = await db.order.updateMany({
    where: { id: orderId, paymentStatus: ORDER_PAYMENT_STATUS.PENDING, refundFailedAt: null },
    data: { paymentStatus: ORDER_PAYMENT_STATUS.FAILED },
  });
  return updated.count > 0;
}
