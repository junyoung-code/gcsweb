import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiError as jsonError } from '@/lib/api-response';

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
        if (!product.legacyQrItemId) return [];
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
        if (!option.legacyQrItemId) return [];
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
