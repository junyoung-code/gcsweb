import {
  MockServiceError,
  resolveMockScenario,
  type MockScenario,
} from '@/lib/mocks/mock-service';
import type {
  SalesManagementLandingService,
  SalesManagementService,
} from '@/lib/services/sales-management-service';
import type {
  ProductFormInput,
  SalesProduct,
  SalesStore,
  SellerSummary,
  StoreFormInput,
} from '@/types/sales-management';

export type SalesManagementLandingMockState =
  | 'success'
  | 'empty'
  | 'error'
  | 'loading';

const registeredSellerSummary: SellerSummary = {
  store: {
    hasSalesHistory: true,
    id: 'store-itjang',
    name: '잇장샵',
    storeIdentifier: 'itjang-shop',
    visitorOrderUrl: '/QRshop?store=itjang-shop',
    description: 'ygygygy23233',
  },
  productCount: 0,
  orderCount: 12,
  lowStockCount: 2,
};

const emptySellerSummary: SellerSummary = {
  store: null,
  productCount: 0,
  orderCount: 0,
  lowStockCount: 0,
};

function getScenario(
  state: SalesManagementLandingMockState,
): MockScenario<SellerSummary> {
  switch (state) {
    case 'empty':
      return { kind: 'empty', data: emptySellerSummary };
    case 'error':
      return {
        kind: 'error',
        message: '판매 관리 정보를 불러오지 못했습니다.',
      };
    case 'loading':
      return { kind: 'success', data: registeredSellerSummary, delayMs: 1200 };
    default:
      return { kind: 'success', data: registeredSellerSummary };
  }
}

export function createMockSalesManagementLandingService(
  state: SalesManagementLandingMockState = 'success',
): SalesManagementLandingService {
  return {
    getSellerSummary: () => resolveMockScenario(getScenario(state)),
  };
}

const unavailableStoreIdentifiers = new Set(['gcs', 'admin', 'taken-shop']);

const defaultStore: SalesStore = {
  hasSalesHistory: true,
  id: 'store-itjang',
  name: '잇장샵',
  storeIdentifier: 'itjang-shop',
  visitorOrderUrl: '/QRshop?store=itjang-shop',
  description: '일상의 즐거움을 소개하는 상점',
};

export interface SalesManagementMockOptions {
  store?: SalesStore | null;
  products?: SalesProduct[];
  saveProductScenario?: MockScenario<SalesProduct>;
}

function normaliseStoreIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function createSalesManagementMockService(
  options: SalesManagementMockOptions = {},
): SalesManagementService {
  let registeredStore: SalesStore | null =
    options.store === undefined ? defaultStore : options.store;
  const products = [...(options.products ?? [])];

  return {
    async getStore() {
      return resolveMockScenario({ kind: 'success', data: registeredStore });
    },

    async checkStoreIdentifier(storeIdentifier) {
      const identifier = normaliseStoreIdentifier(storeIdentifier);

      if (identifier === 'error-shop') {
        throw new MockServiceError('아이디 확인 중 일시적인 오류가 발생했습니다.');
      }

      return resolveMockScenario({
        kind: 'success',
        data: !unavailableStoreIdentifiers.has(identifier),
      });
    },

    async saveStore(input: StoreFormInput) {
      const storeIdentifier = normaliseStoreIdentifier(input.storeIdentifier);

      if (storeIdentifier === 'error-shop') {
        throw new MockServiceError('상점 등록 중 일시적인 오류가 발생했습니다. 다시 시도해주세요.');
      }

      if (unavailableStoreIdentifiers.has(storeIdentifier)) {
        throw new MockServiceError('이미 사용 중인 상점 아이디입니다.');
      }

      registeredStore = {
        hasSalesHistory: registeredStore?.hasSalesHistory ?? false,
        id: `store-${storeIdentifier}`,
        name: input.name.trim(),
        storeIdentifier,
        visitorOrderUrl: `/QRshop?store=${encodeURIComponent(storeIdentifier)}`,
      };

      return resolveMockScenario({ kind: 'success', data: registeredStore });
    },

    async getProducts() {
      return resolveMockScenario({
        kind: products.length === 0 ? 'empty' : 'success',
        data: { items: products, total: products.length },
      });
    },

    async saveProduct(input: ProductFormInput) {
      const product: SalesProduct = {
        id: `product-${products.length + 1}`,
        storeId: input.storeId,
        name: input.name,
        category: input.category,
        price: input.price,
        stock: input.stock,
        imageUrl: input.imageUrl,
        isVisible: true,
        hasSalesHistory: false,
        options: input.options.map((option, index) => ({
          id: `option-${index + 1}`,
          ...option,
        })),
      };
      const saved = options.saveProductScenario
        ? await resolveMockScenario(options.saveProductScenario)
        : product;
      products.unshift(saved);
      return saved;
    },

    async getOrders() {
      return resolveMockScenario({ kind: 'empty', data: { items: [], total: 0 } });
    },

    async getInventory() {
      return resolveMockScenario({ kind: 'empty', data: { items: [], total: 0 } });
    },
  };
}

export const salesManagementMockService = createSalesManagementMockService();
