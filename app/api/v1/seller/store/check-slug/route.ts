import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { getSellerContext } from '@/lib/seller/store';

export const dynamic = 'force-dynamic';

const STORE_SLUG_PATTERN = /^[a-z0-9-]{3,20}$/;

/**
 * 상점 아이디 중복 확인.
 *
 * 등록 화면에서 입력 중 눌러 쓰는 용도라 형식이 틀리면 available=false 와 사유를 함께 준다.
 */
export async function GET(request: Request) {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();

    const slug = new URL(request.url).searchParams.get('slug')?.trim().toLowerCase() ?? '';

    if (!STORE_SLUG_PATTERN.test(slug)) {
      return apiSuccess({
        slug,
        available: false,
        reason: '영문 소문자, 숫자, 하이픈으로 3~20자 입력해주세요.',
      });
    }

    const taken = await prisma.store.findUnique({
      where: { storeSlug: slug },
      select: { storeId: true },
    });

    return apiSuccess({
      slug,
      available: !taken,
      reason: taken ? '이미 사용 중인 상점 아이디입니다.' : null,
    });
  } catch (error) {
    console.error('[seller/store/check-slug] GET error:', error);
    return apiErrors.serverError();
  }
}
