export type QrshopPaymentMethod = 'online' | 'on-site';

export interface QrshopProduct {
  id: string;
  /** Server product identity shared by its option rows. */
  sourceProductId?: string;
  optionId?: string;
  stock?: number;
  basePrice?: number;
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
  sourceProductId?: string;
  optionId?: string;
  productName: string;
  option?: string;
  quantity: number;
  unitPrice: number;
  stock?: number;
  soldOut?: boolean;
}

export interface QrshopOrderDraft {
  termsAgreed?: boolean;
  lines: QrshopCartLine[];
  buyerName: string;
  buyerPhone: string;
  paymentMethod: QrshopPaymentMethod;
}

export type QrshopOrderStatus = 'pending' | 'paid' | 'failed' | 'canceled' | 'refund-pending';
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
  failureCode?: string;
  storeSlug?: string;
}
