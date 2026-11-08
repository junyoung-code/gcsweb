import type {
  InventoryItem,
  ProductFormInput,
  SalesOrder,
  SalesProduct,
  SalesStore,
  SellerSummary,
  SellerLandingSummary,
  VisitorOrderQr,
  StoreFormInput,
} from '@/types/sales-management';
import type { ListResult } from './contracts';

export interface SalesManagementLandingService {
  getSellerSummary(): Promise<SellerSummary>;
}

export interface SalesManagementLandingV2Service extends SalesManagementLandingService {
  readonly dataSource?: 'api' | 'mock';
  getSellerSummary(): Promise<SellerLandingSummary>;
  updateStoreImage(file: File): Promise<SalesStore>;
  deleteProduct(productId: SalesProduct['id']): Promise<SellerLandingSummary>;
  getVisitorOrderQr(): Promise<VisitorOrderQr>;
}

export interface SalesManagementV2Service extends SalesManagementLandingV2Service {
  getStore(): Promise<SalesStore | null>;
  checkStoreIdentifier(identifier: string): Promise<boolean>;
  saveStore(input: StoreFormInput): Promise<SalesStore>;
  deleteStore(): Promise<void>;
  getProducts(): Promise<ListResult<SalesProduct> & { newestProductId: string | null }>;
  getCategories(): Promise<string[]>;
  uploadProductImage(file: File): Promise<string>;
  createCategory(name: string): Promise<string>;
  // Product price is the base price; option.price is an additional amount in v2.
  saveProduct(input: ProductFormInput, id?: string): Promise<SalesProduct>;
}

export interface SalesManagementService {
  getStore(): Promise<SalesStore | null>;
  checkStoreIdentifier(storeIdentifier: StoreFormInput['storeIdentifier']): Promise<boolean>;
  saveStore(store: StoreFormInput): Promise<SalesStore>;
  getProducts(): Promise<ListResult<SalesProduct>>;
  saveProduct(product: ProductFormInput): Promise<SalesProduct>;
  getOrders(): Promise<ListResult<SalesOrder>>;
  getInventory(): Promise<ListResult<InventoryItem>>;
}
