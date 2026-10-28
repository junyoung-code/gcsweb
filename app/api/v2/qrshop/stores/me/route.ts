import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { hasStorePaidSale } from '@/lib/qrshop/sales-history';
import { toStoreDetail } from '@/lib/qrshop/store';
import { requireStoreUser } from '@/lib/qrshop/store-api';

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if (!auth.ok) return auth.response;

    const store = await prisma.store.findUnique({
      where: { userId: auth.userId },
      select: { storeId: true, name: true, storeSlug: true, createdAt: true },
    });
    // 상점이 없는 것은 에러가 아니라 랜딩의 '미등록' 상태이므로 data: null로 응답한다.
    if (!store) return apiSuccess(null);

    return apiSuccess(toStoreDetail(store, await hasStorePaidSale(store.storeId)));
  } catch (error) {
    console.error('[v2/qrshop/stores/me] GET error:', error);
    return apiErrors.serverError();
  }
}
