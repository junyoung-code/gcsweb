import type { Prisma } from '@prisma/client';
import { ONSITE_PAYMENT_STATUS } from '@/lib/admin-onsite-status';
import { prisma } from '@/lib/db';

type Client = Pick<Prisma.TransactionClient, 'orderItem'>;

/**
 * 판매이력 = 결제완료(PAID) 주문에 들어간 OrderItem.
 * OrderItem.onsiteProductId가 채워진 주문만 잡히므로, 주문 로직이 DB 기반으로 전환되기 전의
 * 주문(매핑 없음)은 누락될 수 있다.
 */
const paidOrder = { paymentStatus: ONSITE_PAYMENT_STATUS.PAID } as const;

/** 결제완료된 주문에 이 상품이 한 번이라도 들어갔는지. */
export async function hasProductPaidSale(productId: string, client: Client = prisma): Promise<boolean> {
  const line = await client.orderItem.findFirst({
    where: { onsiteProductId: productId, order: paidOrder },
    select: { id: true },
  });
  return line !== null;
}

/** 결제완료된 주문에 이 상점의 상품이 한 번이라도 들어갔는지. */
export async function hasStorePaidSale(storeId: string, client: Client = prisma): Promise<boolean> {
  const line = await client.orderItem.findFirst({
    where: { onsiteProduct: { storeId }, order: paidOrder },
    select: { id: true },
  });
  return line !== null;
}
