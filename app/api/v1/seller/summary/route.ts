import { prisma } from '@/lib/db';
import { apiErrors, apiSuccess } from '@/lib/api-response';
import { ONSITE_PAYMENT_STATUS } from '@/lib/admin-onsite-status';
import {
  buildVisitorOrderUrl,
  getSellerContext,
  todayRangeInKst,
} from '@/lib/seller/store';

export const dynamic = 'force-dynamic';

/**
 * 판매자 대시보드 요약.
 *
 * 상점이 없으면 store=null 과 0 집계를 돌려준다(가입 직후 상태).
 * 오늘 매출/판매는 KST 기준 당일, 결제완료(PAID)된 주문의 현장 상품 라인만 센다.
 */
export async function GET() {
  try {
    const context = await getSellerContext();
    if (!context.ok) return apiErrors.unauthorized();

    const { store } = context;
    if (!store) {
      return apiSuccess({
        store: null,
        productCount: 0,
        todayRevenue: 0,
        todayOrderCount: 0,
      });
    }

    const { start, end } = todayRangeInKst();

    const paidTodayLine = {
      onsiteProduct: { storeId: store.storeId },
      order: {
        paymentStatus: ONSITE_PAYMENT_STATUS.PAID,
        orderDate: { gte: start, lt: end },
      },
    };

    const [productCount, todayItems] = await Promise.all([
      prisma.onsiteProduct.count({ where: { storeId: store.storeId } }),
      prisma.orderItem.findMany({
        where: paidTodayLine,
        select: { orderId: true, price: true, quantity: true },
      }),
    ]);

    const todayRevenue = todayItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    // 한 주문에 여러 상품이 있어도 판매 '건수'는 주문 단위로 센다.
    const todayOrderCount = new Set(todayItems.map((item) => item.orderId)).size;

    return apiSuccess({
      store: {
        id: store.storeId,
        name: store.name,
        handle: store.handle,
        imageUrl: store.imageUrl,
        visitorOrderUrl: buildVisitorOrderUrl(store.storeSlug),
      },
      productCount,
      todayRevenue,
      todayOrderCount,
    });
  } catch (error) {
    console.error('[seller/summary] GET error:', error);
    return apiErrors.serverError();
  }
}
