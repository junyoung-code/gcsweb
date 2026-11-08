import type { SalesManagementV2Service } from './sales-management-service';
import type { SalesProduct, SalesStore } from '@/types/sales-management';

// Contract: upstream/main c4ba954, app/api/v2/qrshop/{stores,summary,products,categories} and app/api/v1/images.
type StoreResponse = { storeId: string; name: string; storeSlug: string; storeUrl: string; hasSalesHistory?: boolean };
type CategoryResponse = { id: string; name: string };
type ProductResponse = {
  id: string; name: string; imageUrl: string | null; category: CategoryResponse | null;
  price: number; totalStock: number; usesOptions: boolean; hasSalesHistory: boolean;
  options: { id: string; name: string; surcharge: number; stock: number }[];
};
type ProductListResponse = { products: ProductResponse[]; total: number; hasNext: boolean };
type SummaryResponse = {
  store: { id: string; name: string; storeSlug: string; visitorOrderUrl: string } | null;
  productCount: number; todayRevenue: number; todayOrderCount: number;
};

export class StoreApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

const errorMessages: Record<string, string> = {
  UNAUTHORIZED: '로그인이 필요해요. 다시 로그인해주세요.',
  NOT_FOUND: '상점을 찾을 수 없거나 접근 권한이 없어요. 다시 불러와주세요.',
  STORE_ALREADY_EXISTS: '이미 등록한 상점이 있어요. 다시 불러와주세요.',
  STORE_SLUG_TAKEN: '이미 사용 중인 상점 아이디입니다. 다시 확인해주세요.',
  PRODUCT_HAS_SALES: '판매 이력이 있는 상품은 삭제할 수 없어요.',
  STORE_REQUIRED: '상점을 먼저 등록해주세요.',
  STORE_HAS_SALES: '판매 이력이 있는 상점은 삭제할 수 없어요.',
};

export function salesApiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof StoreApiError ? error.message : fallback;
}

export function createStoreApiService(): SalesManagementV2Service {
  let currentStore: SalesStore | null | undefined;
  let categories: CategoryResponse[] = [];
  let newestProductId: string | null = null;
  const root = '/api/v2/qrshop';
  async function request<T>(path: string, init?: RequestInit, base = root): Promise<T> {
    const response = await fetch(`${base}${path}`, { credentials: 'same-origin', cache: 'no-store', ...init });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.status !== 'success') {
      const code = body?.code ?? 'SERVER_ERROR';
      throw new StoreApiError(code, errorMessages[code] ?? body?.message ?? '요청에 실패했어요. 다시 시도해주세요.', response.status);
    }
    return body.data as T;
  }
  const mapStore = (data: StoreResponse): SalesStore => ({
    id: data.storeId, name: data.name, storeIdentifier: data.storeSlug, visitorOrderUrl: data.storeUrl,
    hasSalesHistory: data.hasSalesHistory ?? currentStore?.hasSalesHistory ?? false,
  });
  async function getStore() {
    const data = await request<StoreResponse | null>('/stores/me');
    currentStore = data ? mapStore(data) : null;
    return currentStore;
  }
  async function requireStore() {
    const store = currentStore === undefined ? await getStore() : currentStore;
    if (!store) throw new StoreApiError('NOT_FOUND', '상점 등록 후 이용해주세요.', 404);
    return store;
  }
  const mapProduct = (product: ProductResponse, storeId: string): SalesProduct => ({
    id: product.id, storeId, name: product.name, price: product.price,
    imageUrl: product.imageUrl || undefined, category: product.category?.name ?? '',
    stock: product.totalStock, hasSalesHistory: product.hasSalesHistory,
    // Seller product responses have no POS exposure field. API mode never opens Mock POS.
    isVisible: true,
    options: product.usesOptions ? product.options.map(option => ({
      id: option.id, name: option.name, price: option.surcharge, stock: option.stock,
    })) : [],
  });
  async function getSellerSummary() {
    const [summary, store] = await Promise.all([request<SummaryResponse>('/summary'), getStore()]);
    const recent = summary.store && store
      ? await request<ProductListResponse>('/products?page=1&pageSize=6') : null;
    return {
      store: summary.store ? store : null,
      productCount: summary.productCount, todayRevenue: summary.todayRevenue, todaySalesCount: summary.todayOrderCount,
      // These counts have no summary contract and are not displayed.
      orderCount: 0, lowStockCount: 0,
      recentProducts: recent && store ? recent.products.map(product => mapProduct(product, store.id)) : [],
    };
  }
  return {
    dataSource: 'api',
    getStore,
    async checkStoreIdentifier(identifier) {
      if (identifier === currentStore?.storeIdentifier) return true;
      const data = await request<{ available: boolean }>(`/stores/check-id?storeSlug=${encodeURIComponent(identifier)}`);
      return data.available;
    },
    async saveStore(input) {
      const previous = currentStore === undefined ? await getStore() : currentStore;
      const data = await request<StoreResponse>(previous ? `/stores/${encodeURIComponent(previous.id)}` : '/stores', {
        method: previous ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: input.name.trim(), storeSlug: input.storeIdentifier }),
      });
      currentStore = mapStore(data);
      return currentStore;
    },
    async deleteStore() {
      const store = await requireStore();
      await request(`/stores/${encodeURIComponent(store.id)}`, { method: 'DELETE' });
      currentStore = null;
    },
    async getVisitorOrderQr() {
      const store = await requireStore();
      const data = await request<{ storeUrl: string; svg: string }>(`/stores/${encodeURIComponent(store.id)}/qrcode`);
      return { imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.svg)}`, visitorOrderUrl: data.storeUrl };
    },
    getSellerSummary,
    async getProducts() {
      const store = currentStore === undefined ? await getStore() : currentStore;
      if (!store) return { items: [], total: 0, newestProductId: null };
      const items: SalesProduct[] = [];
      let page = 1;
      let result: ProductListResponse;
      // Keep the existing local search/pagination UI, including products beyond the API's first page.
      do {
        result = await request<ProductListResponse>(`/products?page=${page++}&pageSize=100`);
        items.push(...result.products.map(product => mapProduct(product, store.id)));
      } while (result.hasNext);
      return { items, total: result.total, newestProductId };
    },
    async getCategories() {
      const data = await request<{ categories: CategoryResponse[] }>('/categories');
      categories = data.categories;
      return categories.map(category => category.name);
    },
    async createCategory(name) {
      const value = name.trim();
      const existing = categories.find(category => category.name === value);
      if (existing) return existing.name;
      const data = await request<{ category: CategoryResponse }>('/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: value }),
      });
      categories = [...categories.filter(category => category.id !== data.category.id), data.category];
      return data.category.name;
    },
    async saveProduct(input, id) {
      const store = await requireStore();
      if (input.storeId !== store.id) throw new StoreApiError('NOT_FOUND', '상점을 찾을 수 없어요. 다시 불러와주세요.', 404);
      const categoryName = input.category.trim();
      if (categoryName && !categories.some(category => category.name === categoryName)) {
        await this.createCategory(categoryName);
      }
      const categoryId = categories.find(category => category.name === categoryName)?.id;
      const data = await request<{ product: ProductResponse }>(id ? `/products/${encodeURIComponent(id)}` : '/products', {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name.trim(), price: input.price, imageUrl: input.imageUrl ?? (id ? null : undefined),
          categoryId: categoryId ?? (id ? null : undefined), hasOption: input.usesOptions,
          ...(input.usesOptions ? {} : { totalStock: input.stock }),
          // PATCH replaces all options. [] also clears them when changing to no options.
          options: input.usesOptions ? input.options.map(option => ({ name: option.name.trim(), surcharge: option.price, stock: option.stock })) : [],
        }),
      });
      if (!id) newestProductId = data.product.id;
      return mapProduct(data.product, store.id);
    },
    async deleteProduct(id) {
      await request(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (newestProductId === id) newestProductId = null;
      return getSellerSummary();
    },
    async uploadProductImage(file) {
      if (!file.size || file.size > 10 * 1024 * 1024 ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase()) ||
          !/\.(jpe?g|png|webp)$/i.test(file.name)) {
        throw new Error('JPEG, PNG, WebP 이미지 파일을 10MB 이하로 선택해주세요.');
      }
      const body = new FormData();
      body.set('usage', 'ONSITE_PRODUCT'); body.set('image', file);
      const data = await request<{ imageUrl: string }>('', { method: 'POST', body }, '/api/v1/images');
      return data.imageUrl;
    },
    async updateStoreImage() { throw new Error('현재 API 모드에서는 상점 이미지 연동을 지원하지 않아요.'); },
  };
}
