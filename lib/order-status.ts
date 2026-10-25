/**
 * Order 전체(shop·QR샵 공용)의 결제방법·결제상태·수령상태.
 * 값 자체는 prisma/schema.prisma의 enum(PaymentMethod / PaymentStatus / ReceiptStatus)이 정의하고,
 * 이 파일은 클라이언트 컴포넌트에서도 쓸 수 있도록 같은 값을 상수로 노출한다(`satisfies`로 enum과 어긋나면 컴파일 에러).
 *
 * 결제상태와 수령상태는 별개의 축이다. 결제를 마쳐도 수령 전일 수 있고, 현장결제는
 * 수령 전에 관리자가 결제완료 처리를 한다. 두 값을 서로 연동해서 바꾸지 않는다.
 *
 * 어드민 화면 라벨 판정 흐름
 *
 * 결제상태(paymentStatus) → toOrderPaymentStatusLabel
 *   ├─ CANCELED ──────────────────→ "결제취소"
 *   ├─ FAILED ────────────────────→ "결제실패"
 *   ├─ PAID ──────────────────────→ "결제완료" (ORDER_ADMIN_PAYMENT_COMPLETED_LABEL)
 *   └─ PENDING (위 셋이 아닌 나머지)
 *        ├─ 현장결제(ON_SITE) ─────→ "미결제"
 *        └─ 온라인결제(ONLINE)
 *             ├─ 주문시각 없음/깨짐 ──→ "결제실패"
 *             └─ 경과시간(now - 주문시각)
 *                  ├─ 60초 초과 ─────→ "결제실패" (이탈로 간주)
 *                  └─ 60초 이내 ─────→ "결제대기"
 *
 * 수령상태(receiptStatus) → toOrderReceiptStatusLabel
 *   ├─ RECEIVED ──→ "수령완료"
 *   └─ 그 외 ──────→ "미수령"
 */
import type { PaymentMethod, PaymentStatus, ReceiptStatus } from '@prisma/client';

export type { PaymentMethod, PaymentStatus, ReceiptStatus };

/** 결제방법. 세부 PG 수단(card 등)은 PortOne 응답으로 기록한다. */
export const ORDER_PAYMENT_METHOD = {
  ONLINE: 'ONLINE',
  ON_SITE: 'ON_SITE',
} as const satisfies Record<PaymentMethod, PaymentMethod>;

export const ORDER_PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  CANCELED: 'CANCELED',
  FAILED: 'FAILED',
} as const satisfies Record<PaymentStatus, PaymentStatus>;

export const ORDER_RECEIPT_STATUS = {
  NOT_RECEIVED: 'NOT_RECEIVED',
  RECEIVED: 'RECEIVED',
} as const satisfies Record<ReceiptStatus, ReceiptStatus>;

export const ORDER_PAYMENT_METHODS = Object.values(ORDER_PAYMENT_METHOD);
export const ORDER_PAYMENT_STATUSES = Object.values(ORDER_PAYMENT_STATUS);
export const ORDER_RECEIPT_STATUSES = Object.values(ORDER_RECEIPT_STATUS);

/** 어드민 수령 목록에서 [결제완료] 필터에 쓰는 표시 — `toOrderPaymentStatusLabel` 결과와 동일해야 함 */
export const ORDER_ADMIN_PAYMENT_COMPLETED_LABEL = '결제완료';

/** 온라인 결제는 verify 전까지 PENDING. 결제창을 연 뒤 이만큼 지나도 미검증이면 실패·이탈로 본다. */
const ONLINE_PENDING_STALE_MS = 60 * 1000;

export function isOnSitePaymentMethod(paymentMethod: PaymentMethod) {
  return paymentMethod === ORDER_PAYMENT_METHOD.ON_SITE;
}

export function toOrderPaymentStatusLabel(params: {
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** 있으면 온라인 PENDING 주문을 결제대기/결제실패(이탈)로 나눈다. */
  orderDate?: Date;
}) {
  const { paymentMethod, paymentStatus, orderDate } = params;

  if (paymentStatus === ORDER_PAYMENT_STATUS.CANCELED) return '결제취소';
  if (paymentStatus === ORDER_PAYMENT_STATUS.FAILED) return '결제실패';
  if (paymentStatus === ORDER_PAYMENT_STATUS.PAID) return ORDER_ADMIN_PAYMENT_COMPLETED_LABEL;

  // PENDING
  if (isOnSitePaymentMethod(paymentMethod)) return '미결제';

  if (!orderDate || Number.isNaN(orderDate.getTime())) return '결제실패';
  const ageMs = Date.now() - orderDate.getTime();
  return ageMs > ONLINE_PENDING_STALE_MS ? '결제실패' : '결제대기';
}

export function toOrderReceiptStatusLabel(receiptStatus: ReceiptStatus) {
  return receiptStatus === ORDER_RECEIPT_STATUS.RECEIVED ? '수령완료' : '미수령';
}
