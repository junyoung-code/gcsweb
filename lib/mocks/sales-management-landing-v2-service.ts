import type { SalesManagementV2Service } from '@/lib/services/sales-management-service';
import type { SalesProduct, SellerLandingSummary } from '@/types/sales-management';
import { MockServiceError } from './mock-service';

export type LandingV2MockState = 'success' | 'empty' | 'store-only' | 'no-image' | 'loading' | 'error' | 'no-sales';

export function parseLandingV2MockState(value?: string): LandingV2MockState {
  switch (value) {
    case 'no-sales': case 'empty': case 'store-only': case 'no-image': case 'loading': case 'error': return value;
    default: return 'success';
  }
}

const assetRoot = '/assets/sales-management/v2';
// The fixed QR image is an example, not a QR for this store URL.
const visitorOrderUrl = 'https://www.gcsweb.kr/QRshop?store=ybbybby0308';

export function createMockLandingV2Service(
  state: LandingV2MockState = 'success',
  options: { productCount?: number; catalog?: boolean } = {},
): SalesManagementV2Service {
  const emptyProducts = state === 'empty' || state === 'store-only' || state === 'no-image';
  let products: SalesProduct[] = Array.from({ length: emptyProducts ? 0 : options.productCount ?? 36 }, (_, index) => ({
    id: `landing-product-${index + 1}`,
    storeId: 'landing-store',
    name: '무슨무슨시계',
    price: 30000,
    imageUrl: `${assetRoot}/watch.png`,
    category: '태그',
    stock: 30,
    isVisible: true,
    hasSalesHistory: state !== 'no-sales' && index === 2,
    options: Array.from({ length: 8 }, (_, option) => ({ id: `option-${option}`, name: `옵션 ${option + 1}`, price: 0, stock: 0 })),
  }));
  let store: SellerLandingSummary['store'] = state === 'empty' ? null : {
    hasSalesHistory: products.some(product => product.hasSalesHistory),
    id: 'landing-store', name: '잇장샵', storeIdentifier: 'ybbybby0308', visitorOrderUrl,
    imageUrl: state === 'no-image' ? undefined : `${assetRoot}/store.png`,
  };

  if (options.catalog) products = products.map((product, index) => ({
    ...product, name: index < 30 ? '무슨무슨가방' : index < 33 ? '데일리 신발' : '코튼 상의',
    category: index < 30 ? '숄더백' : index < 33 ? '신발' : '상의',
    price: 126000, stock: 58, imageUrl: `${assetRoot}/products/bag.png`,
    options: [5, 20, 12, 21].map((stock, i) => ({ id: `${product.id}-option-${i}`, name: '옵션', price: 0, stock })),
  }));
  let categories = ['숄더백', '신발', '상의'];
  let newestProductId: string | null = null;
  let sequence = products.length;
  const copy = (product: SalesProduct): SalesProduct => ({ ...product, options: product.options.map(option => ({ ...option })) });

  const snapshot = (): SellerLandingSummary => ({
    store: store ? { ...store } : null,
    productCount: products.length,
    orderCount: store?.hasSalesHistory ? 128 : 0,
    lowStockCount: 0,
    todayRevenue: store?.hasSalesHistory ? 128000 : 0,
    todaySalesCount: store?.hasSalesHistory ? 128 : 0,
    // Fixtures are already ordered newest first. Deletion refills the recent window.
    recentProducts: products.slice(0, 6).map(product => ({ ...product, options: product.options.map(option => ({ ...option })) })),
  });

  const unavailableIdentifiers = new Set(['admin', 'taken123']);
  const validIdentifier = (value: string) => /^[a-z0-9]{4,20}$/.test(value);

  return {
    dataSource: 'mock',
    async getStore() { return store ? { ...store } : null; },
    async checkStoreIdentifier(identifier) {
      return validIdentifier(identifier) && (identifier === store?.storeIdentifier || !unavailableIdentifiers.has(identifier));
    },
    async saveStore(input) {
      const identifier = input.storeIdentifier;
      if (input.name.trim().length < 2 || !validIdentifier(identifier)) {
        throw new MockServiceError('상점명과 상점 아이디를 확인해주세요.');
      }
      if (identifier !== store?.storeIdentifier && unavailableIdentifiers.has(identifier)) {
        throw new MockServiceError('이미 사용 중인 상점 아이디입니다.');
      }
      store = {
        ...store, id: store?.id ?? 'landing-store', hasSalesHistory: store?.hasSalesHistory ?? false,
        name: input.name.trim(), storeIdentifier: identifier,
        visitorOrderUrl: `https://www.gcsweb.kr/QRshop?store=${encodeURIComponent(identifier)}`,
      };
      return { ...store };
    },
    async deleteStore() {
      if (!store) throw new MockServiceError('상점을 찾을 수 없어요.');
      if (store.hasSalesHistory) throw new MockServiceError('판매 이력이 있는 상점은 삭제할 수 없어요.');
      products = products.filter(product => product.storeId !== store!.id);
      newestProductId = null;
      store = null;
    },
    async getProducts() { return { items: products.map(copy), total: products.length, newestProductId }; },
    async uploadProductImage(file) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image'));
        reader.onerror = reader.onabort = () => reject(new Error('Image read failed'));
        reader.readAsDataURL(file);
      });
    },
    async getCategories() { return [...categories]; },
    async createCategory(name) {
      const value = name.trim();
      if (!value) throw new MockServiceError('카테고리를 입력해주세요.');
      if (Array.from(value).length > 8) throw new MockServiceError('카테고리는 최대 8자까지 입력해주세요.');
      if (!categories.includes(value)) categories = [...categories, value];
      return value;
    },
    async saveProduct(input, id) {
      if (!store || input.storeId !== store.id) throw new MockServiceError('상점 등록 후 상품을 등록해주세요.');
      const previous = id ? products.find(product => product.id === id) : undefined;
      if (id && !previous) throw new MockServiceError('상품을 찾을 수 없어요.');
      const validNumber = (value: number) => Number.isSafeInteger(value) && value >= 0;
      if (Array.from(input.category.trim()).length > 8) throw new MockServiceError('카테고리는 최대 8자까지 입력해주세요.');
      if (!input.name.trim() || input.name.trim().length > 20 || !validNumber(input.price) ||
          (input.usesOptions ? !input.options.length || input.options.some(option => !option.name.trim() || option.name.trim().length > 18 || !validNumber(option.price) || !validNumber(option.stock)) : !validNumber(input.stock))) {
        throw new MockServiceError('상품명, 가격, 재고와 옵션을 확인해주세요.');
      }
      const stock = input.usesOptions ? input.options.reduce((sum, option) => sum + option.stock, 0) : input.stock;
      if (!validNumber(stock)) throw new MockServiceError('총재고를 확인해주세요.');
      const productId = id ?? `landing-product-${++sequence}`;
      const product: SalesProduct = {
        hasSalesHistory: previous?.hasSalesHistory ?? false,
        id: productId, storeId: store.id, name: input.name.trim(), category: input.category.trim(),
        price: input.price, stock, imageUrl: input.imageUrl, isVisible: previous?.isVisible ?? true,
        options: input.usesOptions ? input.options.map((option, i) => ({ ...option, name: option.name.trim(), id: `${productId}-option-${i}` })) : [],
      };
      if (product.category && !categories.includes(product.category)) categories.push(product.category);
      if (id) products = products.map(item => item.id === id ? product : item);
      else { products = [product, ...products]; newestProductId = product.id; }
      return copy(product);
    },
    async getSellerSummary() {
      if (state === 'loading') await new Promise(resolve => setTimeout(resolve, 1500));
      if (state === 'error') throw new MockServiceError('판매 관리 정보를 불러오지 못했어요.');
      return snapshot();
    },
    async updateStoreImage(file) {
      if (!store) throw new MockServiceError('상점 등록 후 이미지를 등록해주세요.');
      if (!file.type.startsWith('image/')) throw new MockServiceError('이미지 파일을 선택해주세요.');
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new MockServiceError('이미지를 불러오지 못했어요. 다시 시도해주세요.'));
        reader.readAsDataURL(file);
      });
      store = { ...store, imageUrl };
      return { ...store };
    },
    async deleteProduct(productId) {
      const product = products.find(product => product.id === productId);
      if (!product) throw new MockServiceError('상품을 찾을 수 없어요.');
      if (product.hasSalesHistory) throw new MockServiceError('판매 이력이 있는 상품은 삭제할 수 없어요.');
      products = products.filter(product => product.id !== productId);
      if (newestProductId === productId) newestProductId = null;
      return snapshot();
    },
    async getVisitorOrderQr() {
      if (!store) throw new MockServiceError('상점 등록 후 QR을 발급받을 수 있어요.');
      return { isMock: true, imageUrl: `${assetRoot}/visitor-order-qr.png`, visitorOrderUrl: store.visitorOrderUrl };
    },
  };
}
