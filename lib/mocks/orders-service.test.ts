import { describe, expect, it } from 'vitest';
import { seoulOrderDate, type OrdersQuery, type SalesOrder } from '@/lib/services/orders-service';
import { createMockOrdersService } from './orders-service';

const query: OrdersQuery = { date: '2026-11-07', channel: 'all', search: '', page: 1 };
function order(index: number, overrides: Partial<SalesOrder> = {}): SalesOrder {
  return { id: `order-${index}`, orderNo: String(index).padStart(3, '0'), orderedAt: '2026-11-07T10:00:00+09:00', items: [{ productName: '키링', optionName: 'BLACK', quantity: 2 }], paymentMethod: 'card', paymentAmount: 10000, refundStatus: 'none', ...overrides };
}

describe('주문조회 Mock Service', () => {
  it('한국 날짜 경계로 조회하고 날짜 밖 주문을 제외한다', async () => {
    const service = createMockOrdersService([order(1, { orderedAt: '2026-11-06T15:00:00Z' }), order(2, { orderedAt: '2026-11-06T14:59:59Z' })]);
    expect(seoulOrderDate(new Date('2026-11-06T15:00:00Z'))).toBe(query.date);
    expect((await service.listOrders(query)).orders.map(order => order.id)).toEqual(['order-1']);
  });
  it('온라인/현장을 분리하고 상품·옵션을 공백/대소문자 없이 검색한다', async () => {
    const service = createMockOrdersService([order(1), order(2, { paymentMethod: 'online' }), order(3, { paymentMethod: 'cash', items: [{ productName: '엽서', optionName: null, quantity: 1 }] }), order(4, { paymentMethod: 'transfer' })]);
    expect((await service.listOrders({ ...query, channel: 'online', search: ' black ' })).orders.map(order => order.id)).toEqual(['order-2']);
    expect((await service.listOrders({ ...query, channel: 'onsite' })).total).toBe(3);
    expect((await service.listOrders({ ...query, search: '엽서' })).orders[0].id).toBe('order-3');
    expect((await service.listOrders({ ...query, search: '없음없음' })).total).toBe(0);
  });
  it('최신 주문부터 30건씩 나누고 필터 이후 페이지를 유효 범위로 보정한다', async () => {
    const service = createMockOrdersService(Array.from({ length: 31 }, (_, i) => order(i + 1)));
    const first = await service.listOrders(query);
    expect(first.orders).toHaveLength(30);
    expect(first.orders[0].orderNo).toBe('031');
    expect(first.total).toBe(31);
    expect((await service.listOrders({ ...query, page: 2 })).orders[0].orderNo).toBe('001');
    expect((await service.listOrders({ ...query, channel: 'online', page: 99 }))).toEqual({ orders: [], total: 0, page: 1 });
  });
  it('seed·반환값·다른 인스턴스와 상태를 공유하지 않는다', async () => {
    const seed = [order(1)];
    const service = createMockOrdersService(seed);
    seed[0].items[0].productName = '외부 변경';
    const result = await service.listOrders(query);
    result.orders[0].items[0].productName = '화면 변경';
    expect((await service.listOrders(query)).orders[0].items[0].productName).toBe('키링');
    expect((await createMockOrdersService([]).listOrders(query)).total).toBe(0);
  });

  it.each([true, false])('환불 결과와 재고 복원 선택 %s만 저장하고 중복 실행을 거절한다', async restoreStock => {
    const seed = [order(1), order(2)];
    const service = createMockOrdersService(seed);
    const [first, duplicate] = await Promise.allSettled([
      service.refundOrder('order-1', restoreStock), service.refundOrder('order-1', !restoreStock),
    ]);
    expect(first.status).toBe('fulfilled');
    expect(duplicate.status).toBe('rejected');
    const saved = (await service.listOrders(query)).orders.find(order => order.id === 'order-1');
    expect(saved).toEqual({ ...seed[0], refundStatus: 'refunded', refundRestoreStock: restoreStock });
    expect((await service.listOrders(query)).orders.find(order => order.id === 'order-2')).toEqual(seed[1]);
    if (first.status === 'fulfilled') first.value.refundStatus = 'none';
    expect((await service.listOrders(query)).orders.find(order => order.id === 'order-1')?.refundStatus).toBe('refunded');
    expect(seed[0].refundStatus).toBe('none');
    expect((await createMockOrdersService(seed).listOrders(query)).orders.every(order => order.refundStatus === 'none')).toBe(true);
  });

  it('알 수 없는 주문·환불 대기·완료 주문은 수정하지 않는다', async () => {
    const seed = [order(1, { refundStatus: 'pending' }), order(2, { refundStatus: 'refunded' })];
    const service = createMockOrdersService(seed);
    const before = await service.listOrders(query);
    for (const id of ['missing', 'order-1', 'order-2']) await expect(service.refundOrder(id, true)).rejects.toThrow();
    expect(await service.listOrders(query)).toEqual(before);
  });
});
