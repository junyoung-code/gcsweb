import { apiError as jsonError } from '@/lib/api-response';

/**
 * QR샵 v1 주문 생성은 종료됐다(v2로 대체). 410 Gone을 반환한다.
 *
 * 결제상태·결제방법 코드를 재정의(lib/order-status.ts)하면서 v1이 만들던 주문의 의미가
 * 달라지므로, 마이그레이션과 같은 배포에서 새 주문 접수를 막는다. 이 파일은 v1 철거(PR6)에서 삭제한다.
 */
export async function POST() {
  return jsonError(410, 'QRSHOP_V1_DISABLED', 'QR샵 v1 주문은 종료되었습니다.');
}
