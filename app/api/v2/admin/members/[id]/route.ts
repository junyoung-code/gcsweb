import { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { apiError, apiErrors, apiSuccess } from '@/lib/api-response';

const DELETE_CONFIRM_TEXT = '삭제하겠습니다';

const storeExists = () => apiError(409, 'STORE_EXISTS', '상점이 있는 회원은 삭제 불가');

// v1 DELETE /api/v1/admin/members/{id} 명세를 그대로 따르고, 상점 보유 회원의 삭제 차단(409)만 추가했다.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!user) return apiErrors.notFound('회원을 찾을 수 없음');

    const body = (await request.json().catch(() => null)) as { confirmText?: unknown } | null;
    if (body?.confirmText !== DELETE_CONFIRM_TEXT) {
      return apiErrors.invalidInput('확인 문구가 올바르지 않습니다.');
    }

    // 상점이 있는 회원은 confirmText가 맞아도 삭제할 수 없다.
    const store = await prisma.store.findUnique({ where: { userId: user.id }, select: { storeId: true } });
    if (store) return storeExists();

    try {
      await prisma.user.delete({ where: { id: user.id } });
    } catch (error) {
      // 확인과 삭제 사이에 상점이 생기면 Store.userId FK(Restrict)가 막는다.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return storeExists();
      }
      throw error;
    }

    return apiSuccess({ user: { id: user.id } });
  } catch (error) {
    console.error('[v2/admin/members/:id] DELETE error:', error);
    return apiErrors.serverError();
  }
}
