import type { PrismaClient } from '@prisma/client';

/**
 * /shop 주문은 상점이 없으므로 플레이스홀더 상점(`Store.storeSlug = goat`)의 주문으로 처리해
 * QR샵과 같은 주문번호 규칙(OrderNumber: 상점·KST 일별 순번)을 따른다. 상점 행은 마이그레이션이 만든다.
 */
export const SHOP_STORE_SLUG = 'goat';

export async function getShopStoreId(client: Pick<PrismaClient, 'store'>): Promise<string> {
  const store = await client.store.findUnique({ where: { storeSlug: SHOP_STORE_SLUG }, select: { storeId: true } });
  if (!store) {
    throw new Error(`shop placeholder store not found (storeSlug=${SHOP_STORE_SLUG})`);
  }
  return store.storeId;
}
