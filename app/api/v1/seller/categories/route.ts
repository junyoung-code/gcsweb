import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiError, apiErrors, apiSuccess } from '@/lib/api-response';
import { getSellerContext } from '@/lib/seller/store';

export const dynamic = 'force-dynamic';

const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(30),
});

/** 내 상점의 카테고리 목록. 상품 등록 화면의 드롭다운이 이걸 쓴다. */
export async function GET() {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();
    if (!context.store) return apiSuccess({ categories: [] });

    const categories = await prisma.onsiteProductCategory.findMany({
      where: { storeId: context.store.storeId },
      select: { categoryId: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    return apiSuccess({
      categories: categories.map((row) => ({ id: row.categoryId, name: row.name })),
    });
  } catch (error) {
    console.error('[seller/categories] GET error:', error);
    return apiErrors.serverError();
  }
}

/**
 * 카테고리 생성.
 *
 * 상품 등록 화면에서 없는 이름을 엔터로 확정하면 호출된다.
 * 상점 내 이름은 unique 이므로 이미 있으면 그걸 그대로 돌려준다(중복 생성 대신).
 */
export async function POST(request: Request) {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();
    if (!context.store) {
      return apiError(409, 'STORE_REQUIRED', '상점을 먼저 등록해주세요.');
    }

    const parsed = CreateCategorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrors.invalidInput(parsed.error.issues[0]?.message);
    }

    const category = await prisma.onsiteProductCategory.upsert({
      where: {
        storeId_name: { storeId: context.store.storeId, name: parsed.data.name },
      },
      create: { storeId: context.store.storeId, name: parsed.data.name },
      update: {},
      select: { categoryId: true, name: true },
    });

    return apiSuccess({ category: { id: category.categoryId, name: category.name } });
  } catch (error) {
    console.error('[seller/categories] POST error:', error);
    return apiErrors.serverError();
  }
}
