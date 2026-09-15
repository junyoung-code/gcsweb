import type { ListResult } from '@/lib/services/contracts';
import type { QrshopService } from '@/lib/services/qrshop-service';
import type {
  QrshopOrderDraft,
  QrshopOrderResult,
  QrshopPaymentOutcome,
  QrshopProduct,
} from '@/types/qrshop';
import { resolveMockScenario, type MockScenario } from './mock-service';
import { qrshopProducts } from './qrshop-data';

const STORAGE_KEY = 'gcs:qrshop:mock-orders';

type QrshopMockServiceOptions = {
  catalogScenario?: MockScenario<ListResult<QrshopProduct>>;
  delayMs?: number;
};

const memoryOrders = new Map<string, QrshopOrderResult>();

function readStoredOrders(): QrshopOrderResult[] {
  if (typeof window === 'undefined') return [...memoryOrders.values()];

  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as QrshopOrderResult[]) : [];
  } catch {
    return [];
  }
}

function writeOrder(order: QrshopOrderResult): void {
  memoryOrders.set(order.orderId, order);
  if (typeof window === 'undefined') return;

  const orders = readStoredOrders().filter((item) => item.orderId !== order.orderId);
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...orders, order]));
}

function findOrder(orderId: string): QrshopOrderResult | undefined {
  return memoryOrders.get(orderId) ?? readStoredOrders().find((item) => item.orderId === orderId);
}

function makeOrderId(): string {
  return `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeOrderCode(): string {
  return String(100 + Math.floor(Math.random() * 900));
}

function validateDraft(draft: QrshopOrderDraft): void {
  if (draft.lines.length === 0) throw new Error('상품을 한 개 이상 선택해 주세요.');
  if (draft.buyerPhone.trim() && !/^01[016789]-?\d{3,4}-?\d{4}$/.test(draft.buyerPhone.trim())) {
    throw new Error('휴대폰 번호를 확인해 주세요.');
  }

  for (const line of draft.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new Error('상품 수량은 1개부터 99개까지 선택할 수 있습니다.');
    }
  }
}

export function createQrshopMockService(
  options: QrshopMockServiceOptions = {},
): QrshopService {
  const delayMs = Math.max(0, options.delayMs ?? 250);
  const defaultCatalog: ListResult<QrshopProduct> = {
    items: qrshopProducts,
    total: qrshopProducts.length,
  };

  return {
    getCatalog() {
      return resolveMockScenario(
        options.catalogScenario ?? {
          kind: 'success',
          data: defaultCatalog,
          delayMs,
        },
      );
    },

    async createOrder(draft: QrshopOrderDraft) {
      validateDraft(draft);
      const result: QrshopOrderResult = {
        orderId: makeOrderId(),
        orderCode: makeOrderCode(),
        status: 'pending',
        totalAmount: draft.lines.reduce(
          (sum, line) => sum + line.unitPrice * line.quantity,
          0,
        ),
        lines: draft.lines.map((line) => ({ ...line })),
        buyerName: draft.buyerName.trim() || '현장 주문',
        buyerPhone: draft.buyerPhone.trim(),
        paymentMethod: draft.paymentMethod,
        createdAt: new Date().toISOString(),
      };

      await resolveMockScenario({ kind: 'success', data: null, delayMs });
      writeOrder(result);
      return result;
    },

    async getOrder(orderId: string) {
      await resolveMockScenario({ kind: 'success', data: null, delayMs });
      const order = findOrder(orderId);
      if (!order) throw new Error('주문 정보를 찾을 수 없습니다.');
      return { ...order, lines: order.lines.map((line) => ({ ...line })) };
    },

    async processPayment(orderId: string, outcome: QrshopPaymentOutcome) {
      await resolveMockScenario({ kind: 'success', data: null, delayMs: delayMs * 2 });
      const order = findOrder(orderId);
      if (!order) throw new Error('결제할 주문 정보를 찾을 수 없습니다.');

      const next: QrshopOrderResult = {
        ...order,
        status: outcome === 'success' ? 'paid' : 'failed',
        ...(outcome === 'failure'
          ? { failureMessage: '가짜 결제 승인에 실패했습니다. 다시 시도해 주세요.' }
          : { failureMessage: undefined }),
      };
      writeOrder(next);
      return next;
    },
  };
}

export const qrshopMockService = createQrshopMockService();

export function clearQrshopMockOrders(): void {
  memoryOrders.clear();
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORAGE_KEY);
}
