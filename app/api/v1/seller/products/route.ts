import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiError, apiErrors, apiSuccess } from '@/lib/api-response';
import { getSellerContext } from '@/lib/seller/store';

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

function toResponse(product: ProductRow) {
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
    createdAt: product.createdAt.toISOString(),
  };
}

/** 내 상점의 상품 목록. 최신 등록 순. */
export async function GET() {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();
    if (!context.store) return apiSuccess({ products: [] });

    const products = await prisma.onsiteProduct.findMany({
      where: { storeId: context.store.storeId },
      select: PRODUCT_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess({ products: products.map(toResponse) });
  } catch (error) {
    console.error('[seller/products] GET error:', error);
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
    console.error('[seller/products] POST error:', error);
    return apiErrors.serverError();
  }
}
