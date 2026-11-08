export type SalesManagementSection =
  | 'home'
  | 'store'
  | 'products'
  | 'orders'
  | 'inventory';

export interface SalesStore {
  hasSalesHistory: boolean;
  id: string;
  name: string;
  storeIdentifier: string;
  visitorOrderUrl: string;
  description?: string;
  imageUrl?: string;
}

export interface StoreFormInput {
  name: string;
  storeIdentifier: string;
}

export interface SellerSummary {
  store: SalesStore | null;
  productCount: number;
  orderCount: number;
  lowStockCount: number;
}

export interface SellerLandingSummary extends SellerSummary {
  todayRevenue: number;
  todaySalesCount: number;
  recentProducts: SalesProduct[];
}

export interface VisitorOrderQr {
  isMock?: boolean;
  imageUrl: string;
  visitorOrderUrl: string;
}

export interface SalesProduct {
  hasSalesHistory: boolean;
  id: string;
  storeId: SalesStore['id'];
  name: string;
  price: number;
  imageUrl?: string;
  isVisible: boolean;
  category: string;
  stock: number;
  options: ProductOption[];
}

export interface ProductOption {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export interface ProductFormOptionInput {
  name: string;
  price: number;
  stock: number;
}

export interface ProductFormInput {
  storeId: SalesStore['id'];
  name: string;
  category: string;
  imageUrl?: string;
  usesOptions: boolean;
  options: ProductFormOptionInput[];
  price: number;
  stock: number;
}

export type SalesOrderStatus = 'new' | 'confirmed' | 'completed' | 'cancelled';

export interface SalesOrder {
  id: string;
  orderCode: string;
  buyerName: string;
  totalAmount: number;
  status: SalesOrderStatus;
  orderedAt: string;
}

export interface InventoryItem {
  productId: SalesProduct['id'];
  productName: string;
  quantity: number;
  soldOut: boolean;
}
