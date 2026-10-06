import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { createStoreSchema, INVALID_STORE_REQUEST, toStoreSummary } from '@/lib/qrshop/store';
import { isUniqueViolation, requireStoreUser, storeErrors } from '@/lib/qrshop/store-api';

const storeSelect = { storeId: true, name: true, storeSlug: true } as const;

export async function POST(request: Request) {
  try {
    const auth = await requireStoreUser();
    if (!auth.ok) return auth.response;

    const parsed = createStoreSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiErrors.invalidInput(parsed.error.issues[0]?.message ?? INVALID_STORE_REQUEST);
    }
    const { name, storeSlug } = parsed.data;

    // 이미 상점이 있으면 아이디가 겹치더라도 STORE_ALREADY_EXISTS를 우선한다.
    const existing = await prisma.store.findUnique({
      where: { userId: auth.userId },
      select: { storeId: true },
    });
    if (existing) return storeErrors.alreadyExists();

    try {
      const store = await prisma.store.create({
        data: { userId: auth.userId, name, storeSlug },
        select: storeSelect,
      });
      return apiSuccess(toStoreSummary(store));
    } catch (error) {
      // 중복확인과 등록 사이의 동시 요청은 DB unique 위반으로 잡는다.
      if (isUniqueViolation(error, 'userId')) return storeErrors.alreadyExists();
      if (isUniqueViolation(error, 'storeSlug')) return storeErrors.slugTaken();
      throw error;
    }
  } catch (error) {
    console.error('[v2/qrshop/stores] POST error:', error);
    return apiErrors.serverError();
  }
}
