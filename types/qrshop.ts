export type QrshopPaymentMethod = 'online' | 'on-site';

export interface QrshopProduct {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  option?: string;
  price: number;
  imageUrl?: string;
  soldOut?: boolean;
}

export interface QrshopCartLine {
  productId: QrshopProduct['id'];
  productName: string;
  option?: string;
  quantity: number;
  unitPrice: number;
}

export interface QrshopOrderDraft {
  lines: QrshopCartLine[];
  buyerName: string;
  buyerPhone: string;
  paymentMethod: QrshopPaymentMethod;
}

export type QrshopOrderStatus = 'pending' | 'paid' | 'failed';
export type QrshopPaymentOutcome = 'success' | 'failure';
export type QrshopPaymentState =
  | 'idle'
  | 'processing'
  | 'succeeded'
  | 'failed';

export interface QrshopOrderResult {
  orderId: string;
  orderCode: string;
  status: QrshopOrderStatus;
  totalAmount: number;
  lines: QrshopCartLine[];
  buyerName: string;
  buyerPhone: string;
  paymentMethod: QrshopPaymentMethod;
  createdAt: string;
  failureMessage?: string;
}
