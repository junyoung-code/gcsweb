export type OrderPaymentMethod = 'online' | 'card' | 'cash' | 'transfer';
export type OrderChannel = 'all' | 'online' | 'onsite';

export interface SalesOrder {
  id: string;
  orderNo: string;
  orderedAt: string;
  items: { productName: string; optionName: string | null; quantity: number }[];
  paymentMethod: OrderPaymentMethod;
  paymentAmount: number;
  refundStatus: 'none' | 'pending' | 'refunded';
  refundRestoreStock?: boolean;
}

export interface OrdersQuery { date: string; channel: OrderChannel; search: string; page: number }
export interface OrdersResult { orders: SalesOrder[]; total: number; page: number }
export interface OrdersService {
  listOrders(query: OrdersQuery): Promise<OrdersResult>;
  refundOrder(orderId: string, restoreStock: boolean): Promise<SalesOrder>;
}

export const ORDERS_PAGE_SIZE = 30;
export const orderPaymentLabels: Record<OrderPaymentMethod, string> = { online: '온라인결제', card: '카드', cash: '현금', transfer: '계좌이체' };
export const seoulOrderDate = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export const orderItemsText = (order: SalesOrder) => order.items.map(item => `${item.productName}${item.optionName ? `(${item.optionName})` : '(옵션 없음)'}×${item.quantity}`).join(' / ');
