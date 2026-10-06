import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { buildStoreUrl, generateStoreQrSvg } from '@/lib/qrshop/store';
import { requireStoreUser, storeErrors } from '@/lib/qrshop/store-api';

type RouteContext = { params: { storeId: string } };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const auth = await requireStoreUser();
    if (!auth.ok) return auth.response;

    const store = await prisma.store.findFirst({
      where: { storeId: params.storeId, userId: auth.userId },
      select: { storeSlug: true },
    });
    if (!store) return storeErrors.notFound();

    // QR코드는 저장하지 않고 요청 시마다 현재 storeSlug로 생성한다.
    const storeUrl = buildStoreUrl(store.storeSlug);
    return apiSuccess({ storeUrl, svg: await generateStoreQrSvg(storeUrl) });
  } catch (error) {
    console.error('[v2/qrshop/stores/:storeId/qrcode] GET error:', error);
    return apiErrors.serverError();
  }
}
