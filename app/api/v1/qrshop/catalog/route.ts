import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiError as jsonError } from '@/lib/api-response';
import { getQrShopItemById } from '@/lib/qrshop/catalog';

const QRSHOP_STORE_SLUG = 'nirvanaexpress';

type CatalogItem = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  option?: string;
  price: number;
};

/**
 * QR 메뉴(공개 정보만, 재고 제외). OnsiteProduct/OnsiteProductOption 기준.
 * id 는 legacyQrItemId(item.json 이관 추적용) 를 그대로 노출한다 — 주문 생성은 아직
 * item.json 기준 lib/qrshop/catalog.ts 를 거치므로, 카탈로그 소스만 DB로 옮기고
 * id 체계는 과도기적으로 유지한다. legacyQrItemId 가 없는 행(향후 관리자 CRUD로
 * 새로 만든 상품)은 아직 주문 흐름과 연결할 수 없어 응답에서 제외한다.
 *
 * 같은 이유로 legacyQrItemId 가 item.json 에 **없는** 행도 제외한다. DB 에는 지난
 * 일차 옵션까지 남아 있는데(예: `bandana_a` 1일차 vs item.json `bandana_a_day4`),
 * 주문 검증은 item.json 만 신뢰하므로 그대로 내보내면 메뉴에는 보이지만 결제 단계에서
 * "판매하지 않는 상품이 포함되어 있습니다."(400 INVALID_CART)로 막힌다.
 * 주문 금액 산정이 DB 로 완전히 넘어오면 이 필터는 걷어내면 된다.
 */
export async function GET() {
  try {
    const products = await prisma.onsiteProduct.findMany({
      where: { store: { storeSlug: QRSHOP_STORE_SLUG } },
      include: { category: true, options: true },
      orderBy: { createdAt: 'asc' },
    });

    const items: CatalogItem[] = products.flatMap((product) => {
      const categoryId = product.categoryId ?? 'uncategorized';
      const categoryName = product.category?.name ?? '기타';

      if (!product.hasOption) {
        if (!product.legacyQrItemId || !getQrShopItemById(product.legacyQrItemId)) return [];
        return [
          {
            id: product.legacyQrItemId,
            categoryId,
            categoryName,
            name: product.name,
            price: product.price,
          },
        ];
      }

      return product.options.flatMap((option) => {
        if (!option.legacyQrItemId || !getQrShopItemById(option.legacyQrItemId)) return [];
        return [
          {
            id: option.legacyQrItemId,
            categoryId,
            categoryName,
            name: product.name,
            option: option.name,
            // 옵션 금액은 절대가격이 아니라 기본가에 더하는 추가금이다.
            price: product.price + option.surcharge,
          },
        ];
      });
    });

    return NextResponse.json({ status: 'success', data: { items, total: items.length } });
  } catch (error) {
    console.error('QR shop catalog GET error:', error);
    return jsonError(500, 'SERVER_ERROR', 'server internal error.');
  }
}
