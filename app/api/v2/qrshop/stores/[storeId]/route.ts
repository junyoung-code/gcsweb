import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { hasStorePaidSale } from '@/lib/qrshop/sales-history';
import { INVALID_STORE_REQUEST, toStoreDetail, toStoreSummary, updateStoreSchema } from '@/lib/qrshop/store';
import { deleteStoreWithoutSales } from '@/lib/qrshop/store-delete';
import { isUniqueViolation, requireStoreUser, storeErrors } from '@/lib/qrshop/store-api';

type RouteContext = { params: { storeId: string } };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const auth = await requireStoreUser();
    if (!auth.ok) return auth.response;

    // 타인의 상점도 존재 여부를 드러내지 않도록 404로 응답한다.
    const store = await prisma.store.findFirst({
      where: { storeId: params.storeId, userId: auth.userId },
      select: { storeId: true, name: true, storeSlug: true, createdAt: true },
    });
    if (!store) return storeErrors.notFound();

    return apiSuccess(toStoreDetail(store, await hasStorePaidSale(store.storeId)));
  } catch (error) {
    console.error('[v2/qrshop/stores/:storeId] GET error:', error);
    return apiErrors.serverError();
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const auth = await requireStoreUser();
    if (!auth.ok) return auth.response;

    const parsed = updateStoreSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiErrors.invalidInput(parsed.error.issues[0]?.message ?? INVALID_STORE_REQUEST);
    }

    const current = await prisma.store.findFirst({
      where: { storeId: params.storeId, userId: auth.userId },
      select: { storeId: true, name: true, storeSlug: true },
    });
    if (!current) return storeErrors.notFound();

    const { name, storeSlug } = parsed.data;
    // 아이디가 실제로 바뀐 경우에만 URL/QR코드가 재발급된다.
    const urlReissued = storeSlug !== undefined && storeSlug !== current.storeSlug;
    const nameChanged = name !== undefined && name !== current.name;

    // 바뀐 값이 없으면 UPDATE(와 updatedAt 갱신) 없이 현재 값을 그대로 돌려준다.
    if (!nameChanged && !urlReissued) {
      return apiSuccess({ ...toStoreSummary(current), urlReissued: false });
    }

    try {
      const updated = await prisma.store.update({
        where: { storeId: current.storeId },
        data: {
          ...(nameChanged ? { name } : {}),
          ...(urlReissued ? { storeSlug } : {}),
        },
        select: { storeId: true, name: true, storeSlug: true },
      });
      return apiSuccess({ ...toStoreSummary(updated), urlReissued });
    } catch (error) {
      if (isUniqueViolation(error, 'storeSlug')) return storeErrors.slugTaken();
      throw error;
    }
  } catch (error) {
    console.error('[v2/qrshop/stores/:storeId] PATCH error:', error);
    return apiErrors.serverError();
  }
}

/**
 * 상점 삭제. soft delete 없이 즉시 hard delete 이며 상품·카테고리와 미결제 주문까지 함께 지운다.
 * 판매이력(결제완료 주문)이 있으면 삭제 버튼이 감춰지는 상점이라, 직접 호출해도 409 STORE_HAS_SALES 로 거부한다.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const auth = await requireStoreUser();
    if (!auth.ok) return auth.response;

    // 타인의 상점도 존재 여부를 드러내지 않도록 404로 응답한다.
    const current = await prisma.store.findFirst({
      where: { storeId: params.storeId, userId: auth.userId },
      select: { storeId: true },
    });
    if (!current) return storeErrors.notFound();

    const result = await prisma.$transaction((tx) => deleteStoreWithoutSales(tx, current.storeId));
    if (result === 'HAS_SALES') return storeErrors.hasSales();

    return apiSuccess({ storeId: current.storeId });
  } catch (error) {
    console.error('[v2/qrshop/stores/:storeId] DELETE error:', error);
    return apiErrors.serverError();
  }
}
