import { Prisma, type OrderType } from '@prisma/client';

/**
 * QR샵 주문번호(OrderNumber.orderNo). (상점, KST 일자) 안에서 1부터 매기는 순번이다.
 * 자릿수는 고정하지 않으며 표시용 0 채움은 프론트가 한다.
 */
const ORDER_TIME_ZONE = 'Asia/Seoul';
export const ORDER_NUMBER_MAX_RETRIES = 3;

type Tx = Pick<Prisma.TransactionClient, '$executeRaw' | 'orderNumber'>;

/** 주문 일자 키(KST YYMMDD). */
export function getOrderTimeKey(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error('invalid date');
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ORDER_TIME_ZONE,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('failed to format order time key');
  }

  return `${year}${month}${day}`;
}

/**
 * 주문번호를 발급해 OrderNumber 행을 만든다. 반드시 주문 생성과 같은 트랜잭션 안에서 호출한다.
 *
 * (상점, 일자) 단위 advisory lock 으로 같은 상점의 동시 발급을 직렬화해 max+1 이 겹치지 않게 하고,
 * unique 제약은 최후의 방어선으로 둔다(충돌 시 `withOrderNumberRetry` 로 트랜잭션째 재시도).
 */
export async function issueOrderNumber(
  tx: Tx,
  params: { orderId: string; storeId: string; type?: OrderType; now?: Date },
): Promise<{ orderNo: number; orderTimeKey: string }> {
  const { orderId, storeId, type = 'ONSITE', now = new Date() } = params;
  const orderTimeKey = getOrderTimeKey(now);

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order-number:${storeId}:${orderTimeKey}`}))`;

  const { _max } = await tx.orderNumber.aggregate({
    where: { storeId, orderTimeKey },
    _max: { orderNo: true },
  });
  const orderNo = (_max.orderNo ?? 0) + 1;

  await tx.orderNumber.create({ data: { orderId, orderNo, type, storeId, orderTimeKey } });
  return { orderNo, orderTimeKey };
}

/** OrderNumber 의 (storeId, orderTimeKey, orderNo) unique 충돌인지. */
export function isOrderNumberConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return fields.includes('orderNo');
}

/** 주문번호 unique 충돌이면 `run`(트랜잭션 전체)을 최대 3회까지 다시 실행한다. */
export async function withOrderNumberRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= ORDER_NUMBER_MAX_RETRIES || !isOrderNumberConflict(error)) throw error;
    }
  }
}
