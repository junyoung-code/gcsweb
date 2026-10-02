import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { getSellerContext } from '@/lib/seller/store';

export const dynamic = 'force-dynamic';

const OptionInputSchema = z.object({
  name: z.string().trim().min(1).max(18),
  surcharge: z.number().int().min(0),
  stock: z.number().int().min(0),
});

const UpdateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(20).optional(),
    price: z.number().int().min(0).optional(),
    imageUrl: z.string().trim().max(2048).nullable().optional(),
    /** null 을 보내면 카테고리를 뗀다. */
    categoryId: z.string().trim().min(1).nullable().optional(),
    hasOption: z.boolean().optional(),
    totalStock: z.number().int().min(0).optional(),
    /** 보내면 기존 옵션을 전부 대체한다(부분 수정이 아니다). */
    options: z.array(OptionInputSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.hasOption === true && value.options && value.options.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '옵션을 사용하면 옵션이 하나 이상 필요합니다.',
      });
    }
    if (value.options) {
      const names = value.options.map((option) => option.name);
      if (new Set(names).size !== names.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '옵션명이 중복됩니다.' });
      }
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

type RouteContext = { params: { productId: string } };

/** 수정 대상이 내 상점 상품인지 확인한다. */
async function findOwnedProduct(storeId: string, productId: string) {
  return prisma.onsiteProduct.findFirst({
    where: { productId, storeId },
    select: { productId: true, hasOption: true },
  });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();
    if (!context.store) return apiErrors.notFound('상품을 찾을 수 없습니다.');
    const storeId = context.store.storeId;

    const existing = await findOwnedProduct(storeId, params.productId);
    if (!existing) return apiErrors.notFound('상품을 찾을 수 없습니다.');

    const parsed = UpdateProductSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrors.invalidInput(parsed.error.issues[0]?.message);
    }
    const input = parsed.data;

    if (input.categoryId) {
      const owned = await prisma.onsiteProductCategory.findFirst({
        where: { categoryId: input.categoryId, storeId },
        select: { categoryId: true },
      });
      if (!owned) return apiErrors.notFound('카테고리를 찾을 수 없습니다.');
    }

    const hasOption = input.hasOption ?? existing.hasOption;
    // 옵션을 쓰면 재고는 옵션 합계, 아니면 보내준 총재고. 둘 다 없으면 기존 값을 둔다.
    const stock = hasOption
      ? input.options?.reduce((sum, option) => sum + option.stock, 0)
      : input.totalStock;

    const updated = await prisma.$transaction(async (tx) => {
      // 옵션 목록이 오면 통째로 갈아끼운다. 부분 수정은 지원하지 않는다.
      if (input.options) {
        await tx.onsiteProductOption.deleteMany({ where: { productId: params.productId } });
      }

      return tx.onsiteProduct.update({
        where: { productId: params.productId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.hasOption !== undefined ? { hasOption: input.hasOption } : {}),
          ...(stock !== undefined ? { initStock: stock, currentStock: stock } : {}),
          ...(input.options && hasOption
            ? {
                options: {
                  create: input.options.map((option) => ({
                    name: option.name,
                    surcharge: option.surcharge,
                    initStock: option.stock,
                    currentStock: option.stock,
                  })),
                },
              }
            : {}),
        },
        select: PRODUCT_SELECT,
      });
    });

    return apiSuccess({ product: toResponse(updated) });
  } catch (error) {
    console.error('[seller/products/:id] PATCH error:', error);
    return apiErrors.serverError();
  }
}

/**
 * 상품 삭제.
 *
 * 하드 삭제다(디자인 문구: "삭제된 상품은 다시 복구할 수 없습니다").
 * 지난 주문의 OrderItem 은 onDelete: SetNull 이라 남되 상품 참조만 끊긴다.
 * OrderItem 에 이름·가격이 이미 복사돼 있어 주문 내역 표시에는 지장이 없다.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();
    if (!context.store) return apiErrors.notFound('상품을 찾을 수 없습니다.');

    const existing = await findOwnedProduct(context.store.storeId, params.productId);
    if (!existing) return apiErrors.notFound('상품을 찾을 수 없습니다.');

    await prisma.onsiteProduct.delete({ where: { productId: params.productId } });

    return apiSuccess({ productId: params.productId });
  } catch (error) {
    console.error('[seller/products/:id] DELETE error:', error);
    return apiErrors.serverError();
  }
}
