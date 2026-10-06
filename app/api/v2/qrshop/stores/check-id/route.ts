import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { INVALID_STORE_SLUG, storeSlugSchema } from '@/lib/qrshop/store';
import { requireStoreUser } from '@/lib/qrshop/store-api';

export async function GET(request: Request) {
  try {
    const auth = await requireStoreUser();
    if (!auth.ok) return auth.response;

    const parsed = storeSlugSchema.safeParse(new URL(request.url).searchParams.get('storeSlug') ?? undefined);
    if (!parsed.success) {
      return apiErrors.invalidInput(parsed.error.issues[0]?.message ?? INVALID_STORE_SLUG);
    }

    const taken = await prisma.store.findUnique({
      where: { storeSlug: parsed.data },
      select: { storeId: true },
    });
    return apiSuccess({ available: !taken });
  } catch (error) {
    console.error('[v2/qrshop/stores/check-id] GET error:', error);
    return apiErrors.serverError();
  }
}
