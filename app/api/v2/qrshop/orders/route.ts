import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiError, apiErrors, apiSuccess } from '@/lib/api-response';
import { ORDER_PAYMENT_METHOD } from '@/lib/order-status';
import { getPortoneCheckoutPaymentConfig, isPortoneCheckoutConfigured } from '@/lib/payment/portone';
import { generateGuestToken, hashGuestToken } from '@/lib/qrshop/guest-token';
import { issueOrderNumber, withOrderNumberRetry } from '@/lib/qrshop/order-number';
import { validateOrderItems, type ValidateOrderResult } from '@/lib/qrshop/order-validation';
import { INVALID_STORE_SLUG, storeSlugSchema } from '@/lib/qrshop/store';

export const dynamic = 'force-dynamic';

const INVALID_REQUEST = '유효하지 않은 요청';

const CreateOrderSchema = z.object({
  termsAgreed: z.literal(true, { errorMap: () => ({ message: '약관 동의 필요' }) }),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        optionId: z.string().min(1).nullish(),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1),
});

type ValidationFailure = Exclude<ValidateOrderResult, { ok: true }>;

function toValidationError(result: ValidationFailure) {
  switch (result.reason) {
    case 'STORE_NOT_FOUND':
      return apiErrors.notFound('존재하지 않는 상점');
    case 'PRODUCT_NOT_FOUND':
      return apiErrors.notFound('존재하지 않는 상품');
    case 'OPTION_NOT_FOUND':
      return apiErrors.notFound('존재하지 않는 옵션');
    case 'OPTION_REQUIRED':
      return apiErrors.invalidInput('옵션 선택 필요');
    case 'OPTION_NOT_ALLOWED':
      return apiErrors.invalidInput('옵션 미사용 상품');
    case 'SOLD_OUT':
      return apiError(409, 'SOLD_OUT', '품절된 상품', { soldOutItems: result.soldOutItems });
  }
}

/**
 * 방문객 주문 생성. 결제 대기(PENDING) 주문을 만들고 PortOne 결제창에 넘길 값을 돌려준다.
 *
 * 가격은 서버가 계산하고, 재고는 확인만 한다(차감은 결제 확정 때). 로그인 여부와 무관하게 GUEST 주문이며
 * 주문별 방문객 토큰을 발급해 원본은 응답에 한 번만 내려주고 해시만 저장한다.
 */
export async function POST(request: Request) {
  try {
    const slug = storeSlugSchema.safeParse(new URL(request.url).searchParams.get('storeSlug'));
    if (!slug.success) return apiErrors.invalidInput(INVALID_STORE_SLUG);

    const json = await request.json().catch(() => null);
    const parsed = CreateOrderSchema.safeParse(json);
    if (!parsed.success) {
      const termsIssue = parsed.error.issues.find((issue) => issue.path[0] === 'termsAgreed');
      return apiErrors.invalidInput(termsIssue?.message ?? INVALID_REQUEST);
    }

    // 결제창을 열 수 없는 상태에서 주문만 쌓이지 않도록 먼저 확인한다.
    if (!isPortoneCheckoutConfigured()) {
      console.error('[qrshop/orders] PortOne checkout env not set');
      return apiErrors.serverError();
    }

    const validated = await validateOrderItems(prisma, { storeSlug: slug.data, items: parsed.data.items });
    if (!validated.ok) return toValidationError(validated);

    const guestToken = generateGuestToken();
    const { orderId, orderNo } = await withOrderNumberRetry(() =>
      prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            paymentAmount: validated.paymentAmount,
            paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
            buyerType: 'GUEST',
            buyerGuestTokenHash: hashGuestToken(guestToken),
            items: {
              create: validated.lines.map((line) => ({
                onsiteProductId: line.productId,
                onsiteOptionId: line.optionId,
                onsiteProductName: line.productName,
                onsiteOptionName: line.optionName,
                price: line.unitPrice,
                quantity: line.quantity,
              })),
            },
          },
          select: { id: true },
        });
        const { orderNo } = await issueOrderNumber(tx, { orderId: order.id, storeId: validated.store.storeId });
        return { orderId: order.id, orderNo };
      }),
    );

    return apiSuccess({
      orderId,
      orderNo,
      paymentAmount: validated.paymentAmount,
      guestToken,
      payment: { ...getPortoneCheckoutPaymentConfig(), orderName: validated.orderName },
    });
  } catch (error) {
    console.error('[qrshop/orders] POST error:', error);
    return apiErrors.serverError();
  }
}
