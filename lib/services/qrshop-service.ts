import type {
  QrshopOrderDraft,
  QrshopOrderResult,
  QrshopPaymentOutcome,
  QrshopProduct,
} from '@/types/qrshop';
import type { ListResult } from './contracts';

export interface QrshopCatalogResult extends ListResult<QrshopProduct> {
  storeStatus: 'open' | 'closed' | 'unknown';
  store?: { storeId: string; name: string; storeSlug: string };
  categories?: { id: string; name: string }[];
}

export interface QrshopService {
  dataSource?: 'mock' | 'api';
  getCatalog(options?: { refresh?: boolean }): Promise<QrshopCatalogResult>;
  createOrder(order: QrshopOrderDraft): Promise<QrshopOrderResult>;
  getOrder(orderId: string): Promise<QrshopOrderResult>;
  startPayment?(orderId: string, signal?: AbortSignal, buyerEmail?: string, buyerPhone?: string, buyerName?: string): Promise<QrshopOrderResult>;
  verifyPayment?(orderId: string): Promise<QrshopOrderResult>;
  processPayment(
    orderId: string,
    outcome: QrshopPaymentOutcome,
  ): Promise<QrshopOrderResult>;
}
