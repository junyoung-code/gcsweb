import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiError, apiErrors, apiSuccess } from '@/lib/api-response';
import { ORDER_PAYMENT_STATUS } from '@/lib/order-status';
import { getSellerContext } from '@/lib/seller/store';
import {
  buildProductListWhere,
  parsePagination,
  parseProductListFilter,
} from '@/lib/seller/products';

export const dynamic = 'force-dynamic';

const OptionInputSchema = z.object({
  name: z.string().trim().min(1).max(18),
  /** 기본가에 더하는 금액. 절대가격이 아니다. */
  surcharge: z.number().int().min(0),
  stock: z.number().int().min(0),
});

const CreateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(20),
    /** 기본가. 옵션 사용 여부와 무관하게 필수다. */
    price: z.number().int().min(0),
    imageUrl: z.string().trim().max(2048).optional(),
    /** 기존 카테고리를 고른 경우. */
    categoryId: z.string().trim().min(1).optional(),
    /** 목록에 없는 이름을 새로 만든 경우. categoryId 와 동시에 올 수 없다. */
    categoryName: z.string().trim().min(1).max(30).optional(),
    hasOption: z.boolean(),
    /** hasOption=false 일 때 필수. */
    totalStock: z.number().int().min(0).optional(),
    options: z.array(OptionInputSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.categoryId && value.categoryName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'categoryId 와 categoryName 은 함께 보낼 수 없습니다.',
      });
    }
    if (value.hasOption) {
      if (!value.options?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '옵션을 사용하면 옵션이 하나 이상 필요합니다.',
        });
      }
      const names = (value.options ?? []).map((option) => option.name);
      if (new Set(names).size !== names.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '옵션명이 중복됩니다.' });
      }
    } else if (value.totalStock === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '옵션을 쓰지 않으면 총재고가 필요합니다.',
      });
    }
  });

const PRODUCT_SELECT = {
  productId: true,
  name: true,
  imageUrl: true,
  price: true,
  initStock: true,
  currentStock: true,
  hasOption: true,
  createdAt: true,
  category: { select: { categoryId: true, name: true } },
  options: {
    select: { optionId: true, name: true, surcharge: true, currentStock: true },
    orderBy: { name: 'asc' },
  },
} as const;

type ProductRow = {
  productId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  initStock: number;
  currentStock: number;
  hasOption: boolean;
  createdAt: Date;
  category: { categoryId: string; name: string } | null;
  options: Array<{
    optionId: string;
    name: string;
    surcharge: number;
    currentStock: number;
  }>;
};

function toResponse(product: ProductRow, hasSalesHistory = false) {
  return {
    id: product.productId,
    name: product.name,
    imageUrl: product.imageUrl,
    category: product.category
      ? { id: product.category.categoryId, name: product.category.name }
      : null,
    price: product.price,
    totalStock: product.currentStock,
    usesOptions: product.hasOption,
    options: product.options.map((option) => ({
      id: option.optionId,
      name: option.name,
      surcharge: option.surcharge,
      stock: option.currentStock,
    })),
    /** 「전체 상품」 카드가 삭제 버튼을 감추는 조건. 결제완료된 주문이 하나라도 있으면 true. */
    hasSalesHistory,
    createdAt: product.createdAt.toISOString(),
  };
}

/** 결제완료 주문에 한 번이라도 팔린 상품 id 집합. 상품이 없으면 질의하지 않는다. */
async function findSoldProductIds(productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();

  const lines = await prisma.orderItem.findMany({
    where: {
      onsiteProductId: { in: productIds },
      order: { paymentStatus: ORDER_PAYMENT_STATUS.PAID },
    },
    select: { onsiteProductId: true },
    distinct: ['onsiteProductId'],
  });

  return new Set(
    lines
      .map((line) => line.onsiteProductId)
      .filter((id): id is string => id !== null),
  );
}

/**
 * 내 상점의 상품 목록. 최신 등록 순.
 *
 * 쿼리: `q`(상품명 부분 일치), `categoryId`, `page`(기본 1), `pageSize`(기본 20, 최대 100).
 * 필터는 함께 쓰면 AND 로 걸린다.
 *
 * 엠티뷰 구분: `totalCount`는 필터와 무관한 내 상점 전체 상품 수다.
 * totalCount=0 이면 "아직 등록된 상품이 없습니다.", totalCount>0 인데 products 가 비면
 * "검색 결과가 없습니다."를 그린다. `total`은 필터 적용 후 건수다.
 */
export async function GET(request: Request) {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();

    const searchParams = new URL(request.url).searchParams;
    const { page, pageSize } = parsePagination(searchParams);

    if (!context.store) {
      return apiSuccess({
        products: [],
        page,
        pageSize,
        total: 0,
        totalCount: 0,
        hasNext: false,
      });
    }

    const storeId = context.store.storeId;
    const filter = parseProductListFilter(searchParams);
    const where = buildProductListWhere(storeId, filter);

    const [products, total, totalCount] = await Promise.all([
      prisma.onsiteProduct.findMany({
        where,
        select: PRODUCT_SELECT,
        // createdAt 이 같은 상품이 페이지 경계에서 중복·누락되지 않도록 productId 로 고정한다.
        orderBy: [{ createdAt: 'desc' }, { productId: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.onsiteProduct.count({ where }),
      prisma.onsiteProduct.count({ where: { storeId } }),
    ]);

    const soldProductIds = await findSoldProductIds(
      products.map((product) => product.productId),
    );

    return apiSuccess({
      products: products.map((product) =>
        toResponse(product, soldProductIds.has(product.productId)),
      ),
      page,
      pageSize,
      total,
      totalCount,
      hasNext: page * pageSize < total,
    });
  } catch (error) {
    console.error('[qrshop/products] GET error:', error);
    return apiErrors.serverError();
  }
}

/** 상품 등록. 옵션을 쓰면 재고는 옵션 재고 합계로 계산한다. */
export async function POST(request: Request) {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();
    if (!context.store) {
      return apiError(409, 'STORE_REQUIRED', '상점을 먼저 등록해주세요.');
    }
    const storeId = context.store.storeId;

    const parsed = CreateProductSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrors.invalidInput(parsed.error.issues[0]?.message);
    }
    const input = parsed.data;

    const options = input.hasOption ? (input.options ?? []) : [];
    const stock = input.hasOption
      ? options.reduce((sum, option) => sum + option.stock, 0)
      : (input.totalStock ?? 0);

    // 고른 카테고리가 내 상점 것인지 확인한다. 남의 상점 카테고리를 붙이지 못하게.
    if (input.categoryId) {
      const owned = await prisma.onsiteProductCategory.findFirst({
        where: { categoryId: input.categoryId, storeId },
        select: { categoryId: true },
      });
      if (!owned) return apiErrors.notFound('카테고리를 찾을 수 없습니다.');
    }

    const created = await prisma.$transaction(async (tx) => {
      let categoryId = input.categoryId ?? null;

      // 새 이름이면 만들되, 같은 이름이 이미 있으면 그걸 쓴다(상점 내 이름은 unique).
      if (input.categoryName) {
        const category = await tx.onsiteProductCategory.upsert({
          where: { storeId_name: { storeId, name: input.categoryName } },
          create: { storeId, name: input.categoryName },
          update: {},
          select: { categoryId: true },
        });
        categoryId = category.categoryId;
      }

      return tx.onsiteProduct.create({
        data: {
          storeId,
          categoryId,
          name: input.name,
          imageUrl: input.imageUrl || null,
          price: input.price,
          initStock: stock,
          currentStock: stock,
          hasOption: input.hasOption,
          options: input.hasOption
            ? {
                create: options.map((option) => ({
                  name: option.name,
                  surcharge: option.surcharge,
                  initStock: option.stock,
                  currentStock: option.stock,
                })),
              }
            : undefined,
        },
        select: PRODUCT_SELECT,
      });
    });

    return apiSuccess({ product: toResponse(created) });
  } catch (error) {
    console.error('[qrshop/products] POST error:', error);
    return apiErrors.serverError();
  }
}
