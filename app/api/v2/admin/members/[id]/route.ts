import { requireAdmin } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { deleteStoreWithoutSales } from '@/lib/qrshop/store-delete';

const DELETE_CONFIRM_TEXT = '삭제하겠습니다';

/**
 * v1 DELETE /api/v1/admin/members/{id} 명세를 그대로 따르고, 상점 보유 회원의 처리만 추가했다.
 * - 상점 없음: 회원만 삭제
 * - 상점 있고 판매이력(결제완료 주문) 없음: 상점(상품·카테고리·미결제 주문 포함)을 먼저 지우고 회원 삭제
 * - 상점 있고 판매이력 있음: 회원만 삭제. 상점은 Store.userId = null(SetNull)로 남는다
 * 판정부터 삭제까지 한 트랜잭션에서 한다.
 */
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

    await prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({ where: { userId: user.id }, select: { storeId: true } });
      if (store) await deleteStoreWithoutSales(tx, store.storeId);
      await tx.user.delete({ where: { id: user.id } });
    });

    return apiSuccess({ user: { id: user.id } });
  } catch (error) {
    console.error('[v2/admin/members/:id] DELETE error:', error);
    return apiErrors.serverError();
  }
}
