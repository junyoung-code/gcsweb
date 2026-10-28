import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { INVALID_STORE_SLUG, storeSlugSchema } from '@/lib/qrshop/store';

export const dynamic = 'force-dynamic';

type OptionRow = { optionId: string; name: string; surcharge: number; currentStock: number };

type ProductRow = {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  categoryId: string | null;
  hasOption: boolean;
  currentStock: number;
  options: OptionRow[];
};

/** 옵션 없는 상품은 재고 0이면 품절, 옵션 상품은 모든 옵션이 품절이면 품절. */
function isProductSoldOut(product: ProductRow): boolean {
  if (product.hasOption) return product.options.every((option) => option.currentStock <= 0);
  return product.currentStock <= 0;
}

function toProductResponse(product: ProductRow) {
  return {
    productId: product.productId,
    name: product.name,
    price: product.price,
    imageUrl: product.imageUrl,
    categoryId: product.categoryId,
    hasOption: product.hasOption,
    soldOut: isProductSoldOut(product),
    // 옵션 없는 상품의 재고. 옵션 상품은 옵션별 재고(options[].stock)를 쓴다.
    stock: product.hasOption ? null : Math.max(product.currentStock, 0),
    options: product.hasOption
      ? product.options.map((option) => ({
          optionId: option.optionId,
          name: option.name,
          surcharge: option.surcharge,
          stock: Math.max(option.currentStock, 0),
          soldOut: option.currentStock <= 0,
        }))
      : [],
  };
}

/**
 * 방문객용 상점 상품 조회. 로그인 없이 `storeSlug`(@ 제외)로 상점을 찾는다.
 *
 * 카테고리는 상품이 1개 이상인 것만 내려준다.
 * 정렬: 카테고리 등록순, 상품 최신 등록순(productId 보조 정렬), 옵션 등록순(오래된 것이 위, optionId 보조 정렬) — 판매자 상품 API와 같다.
 * 재고 수량(`stock`)은 방문객이 담는 수량을 재고까지만 올리도록(+ 버튼 상한) 내려준다. 조회 시점 값이라 주문 생성 때 서버가 다시 검증한다.
 */
export async function GET(request: Request) {
  try {
    const parsed = storeSlugSchema.safeParse(new URL(request.url).searchParams.get('storeSlug'));
    if (!parsed.success) return apiErrors.invalidInput(INVALID_STORE_SLUG);

    const store = await prisma.store.findUnique({
      where: { storeSlug: parsed.data },
      select: {
        storeId: true,
        name: true,
        storeSlug: true,
        categories: {
          // 상품이 없는 카테고리는 탭을 만들지 않는다.
          where: { products: { some: {} } },
          select: { categoryId: true, name: true },
          orderBy: { createdAt: 'asc' },
        },
        products: {
          select: {
            productId: true,
            name: true,
            price: true,
            imageUrl: true,
            categoryId: true,
            hasOption: true,
            currentStock: true,
            options: {
              select: { optionId: true, name: true, surcharge: true, currentStock: true },
              orderBy: [{ createdAt: 'asc' }, { optionId: 'asc' }],
            },
          },
          orderBy: [{ createdAt: 'desc' }, { productId: 'desc' }],
        },
      },
    });
    if (!store) return apiErrors.notFound('존재하지 않는 상점');

    return apiSuccess({
      store: { storeId: store.storeId, name: store.name, storeSlug: store.storeSlug },
      categories: store.categories,
      products: store.products.map(toProductResponse),
    });
  } catch (error) {
    console.error('[qrshop/catalog] GET error:', error);
    return apiErrors.serverError();
  }
}
