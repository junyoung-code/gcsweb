import { ORDERS_PAGE_SIZE, orderItemsText, seoulOrderDate, type OrdersService, type SalesOrder } from '@/lib/services/orders-service';

// Independent examples: these are never derived from live orders or Mock POS sales.
export function createMockOrdersService(seed?: SalesOrder[]): OrdersService {
  const today = seoulOrderDate();
  const orders: SalesOrder[] = structuredClone(seed ?? [
    { id: 'mock-order-3', orderNo: '003', orderedAt: `${today}T20:52:00+09:00`, items: [{ productName: '부산 엽서', optionName: null, quantity: 1 }], paymentMethod: 'online', paymentAmount: 3000, refundStatus: 'none' },
    { id: 'mock-order-2', orderNo: '002', orderedAt: `${today}T20:51:00+09:00`, items: [{ productName: '고양이 키링', optionName: 'BLACK', quantity: 2 }], paymentMethod: 'card', paymentAmount: 10000, refundStatus: 'pending' },
    { id: 'mock-order-1', orderNo: '001', orderedAt: `${today}T20:50:00+09:00`, items: [{ productName: '전주 엽서', optionName: null, quantity: 1 }], paymentMethod: 'cash', paymentAmount: 3000, refundStatus: 'refunded' },
  ]);
  return {
    async refundOrder(orderId, restoreStock) {
      const order = orders.find(order => order.id === orderId);
      if (!order) throw new Error('주문을 찾을 수 없습니다.');
      if (order.refundStatus !== 'none') throw new Error('이미 환불 처리된 주문입니다.');
      // Record only the example result; never touch product stock, POS sales or payments.
      order.refundStatus = 'refunded';
      order.refundRestoreStock = restoreStock;
      return structuredClone(order);
    },
    async listOrders(query) {
      const search = query.search.trim().toLocaleLowerCase('ko-KR');
      const filtered = orders.filter(order => seoulOrderDate(new Date(order.orderedAt)) === query.date
        && (query.channel === 'all' || (query.channel === 'online' ? order.paymentMethod === 'online' : order.paymentMethod !== 'online'))
        && (!search || orderItemsText(order).toLocaleLowerCase('ko-KR').includes(search)))
        .sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt) || b.orderNo.localeCompare(a.orderNo));
      const total = filtered.length;
      const page = Math.min(Math.max(1, Math.floor(query.page) || 1), Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)));
      return structuredClone({ orders: filtered.slice((page - 1) * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE), total, page });
    },
  };
}
