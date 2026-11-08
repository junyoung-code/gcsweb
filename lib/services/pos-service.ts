import type { QrshopCartLine } from '@/types/qrshop';
import type { SalesProduct } from '@/types/sales-management';

export type PosPaymentMethod = 'card' | 'cash' | 'transfer';

export interface PosCartLine extends QrshopCartLine {
  optionId?: string;
}

export interface PosReceipt {
  orderCode: string;
  lines: PosCartLine[];
  totalAmount: number;
  paymentMethod: PosPaymentMethod;
}

export interface PosProduct extends SalesProduct {
  // The shared catalog currently has no registration date. Do not synthesize it.
  createdAt?: string;
}

export interface PosExposureGroup {
  category: string;
  hidden: boolean;
  productIds: string[];
}

export type PosExposure = PosExposureGroup[];

export interface PosService {
  getCatalog(): Promise<SalesProduct[]>;
  getExposureProducts(): Promise<PosProduct[]>;
  getExposure(): Promise<PosExposure>;
  saveExposure(exposure: PosExposure): Promise<void>;
  completeSale(lines: PosCartLine[], method: PosPaymentMethod): Promise<PosReceipt>;
}

export function copyPosExposure(exposure: PosExposure): PosExposure {
  return exposure.map(group => ({ ...group, productIds: [...group.productIds] }));
}

// Reconcile deleted/recategorized products without changing the shared catalog.
export function reconcilePosExposure(exposure: PosExposure, products: PosProduct[], categories: string[] = []): PosExposure {
  const names = [...new Set([...exposure.map(group => group.category), ...categories, ...products.map(product => product.category)])]
    .filter(Boolean);
  const groups = [...names, ''].map(category => ({ category, hidden: exposure.find(group => group.category === category)?.hidden ?? false, productIds: [] as string[] }));
  const seen = new Set<string>();
  for (const group of exposure) for (const id of group.productIds) {
    const product = products.find(item => item.id === id);
    if (!product || seen.has(id)) continue;
    seen.add(id);
    groups.find(item => item.category === product.category)!.productIds.push(id);
  }
  return groups;
}

export const posLineKey = (line: { productId: string; optionId?: string }) => JSON.stringify([line.productId, line.optionId ?? null]);

export function getPosStock(product: SalesProduct, optionId?: string): number {
  if (!product.isVisible) return 0;
  if (!product.options.length) return optionId ? 0 : product.stock;
  const option = product.options.find(item => item.id === optionId);
  return option ? Math.min(product.stock, option.stock) : 0;
}

export function createPosLine(product: SalesProduct, optionId?: string): PosCartLine {
  const option = product.options.find(item => item.id === optionId);
  return {
    productId: product.id, productName: product.name, optionId: option?.id,
    option: option?.name, unitPrice: product.price + (option?.price ?? 0), quantity: 1,
  };
}
