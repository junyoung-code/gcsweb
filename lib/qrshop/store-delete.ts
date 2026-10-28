import type { Prisma } from '@prisma/client';
import { hasStorePaidSale } from './sales-history';

type Tx = Pick<Prisma.TransactionClient, 'orderItem' | 'order' | 'store' | '$queryRaw'>;

export type StoreDeleteResult = 'DELETED' | 'HAS_SALES';

/**
 * 판매이력(결제완료 주문)이 없는 상점을 지운다. 호출 쪽 트랜잭션 안에서 실행한다.
 *
 * 상점 행을 잠가 판정과 삭제 사이에 새 주문(OrderNumber 의 상점 FK)이 끼어들지 못하게 한다.
 * 상점에 속한 상품·카테고리·옵션은 cascade 로 지워지고, 결제 전·실패·취소 주문은 주문번호만 지워져
 * 주인 없는 주문이 남지 않도록 함께 지운다.
 * 판매이력이 있으면 아무것도 바꾸지 않고 HAS_SALES 를 돌려준다.
 */
export async function deleteStoreWithoutSales(tx: Tx, storeId: string): Promise<StoreDeleteResult> {
  await tx.$queryRaw`SELECT "storeId" FROM "Store" WHERE "storeId" = ${storeId} FOR UPDATE`;
  if (await hasStorePaidSale(storeId, tx)) return 'HAS_SALES';

  await tx.order.deleteMany({ where: { orderNumber: { storeId } } });
  await tx.store.delete({ where: { storeId } });
  return 'DELETED';
}
