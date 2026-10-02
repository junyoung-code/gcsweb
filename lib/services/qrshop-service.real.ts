import { qrshopMockService } from '@/lib/mocks';
import type {
  QrshopOrderDraft,
  QrshopOrderResult,
  QrshopPaymentOutcome,
  QrshopProduct,
} from '@/types/qrshop';
import type { ListResult } from './contracts';
import type { QrshopService } from './qrshop-service';

const GUEST_TOKEN_STORAGE_KEY = 'shop:guest-token';
const REAL_ORDER_STORAGE_KEY = 'gcs:qrshop:real-orders';

function isRealOrderId(orderId: string): boolean {
  return !orderId.startsWith('qr-');
}

function getOrCreateGuestToken(): string {
  const existing = localStorage.getItem(GUEST_TOKEN_STORAGE_KEY)?.trim();
  if (existing) return existing;

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

  localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
  return token;
}

function readRealOrders(): Record<string, QrshopOrderResult> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(REAL_ORDER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, QrshopOrderResult>) : {};
  } catch {
    return {};
  }
}

function writeRealOrder(order: QrshopOrderResult): void {
  if (typeof window === 'undefined') return;
  const orders = readRealOrders();
  orders[order.orderId] = order;
  window.sessionStorage.setItem(REAL_ORDER_STORAGE_KEY, JSON.stringify(orders));
}

type RealOrderApiResponse = {
  status: 'success' | 'error';
  message?: string;
  data?: {
    order: {
      id: string;
      orderCode: string;
      paymentAmount: number;
    };
  };
};

/**
 * 현장결제(on-site) 주문만 실제 /api/v1/qrshop/orders 를 호출해 DB에 저장한다.
 * 온라인결제(online)는 실제 PG(PortOne) 연동이 아직 없어 mock 결제 흐름 그대로 둔다.
 */
async function createRealOnsiteOrder(draft: QrshopOrderDraft): Promise<QrshopOrderResult> {
  const guestToken = getOrCreateGuestToken();
  const response = await fetch('/api/v1/qrshop/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-guest-token': guestToken },
    body: JSON.stringify({
      lines: draft.lines.map((line) => ({ itemId: line.productId, quantity: line.quantity })),
      paymentMethod: 3,
    }),
  });

  const payload = (await response.json().catch(() => null)) as RealOrderApiResponse | null;
  if (!response.ok || !payload || payload.status !== 'success' || !payload.data) {
    throw new Error(payload?.message ?? '주문을 저장하지 못했습니다.');
  }

  const { order } = payload.data;
  // 현장결제는 접수 즉시 흐름이 끝난다(카운터에서 결제) — 'paid'는 "결제 완료"가
  // 아니라 "이 화면에서 더 할 일 없음. 카운터로 가면 됨"을 의미한다.
  const result: QrshopOrderResult = {
    orderId: order.id,
    orderCode: order.orderCode,
    status: 'paid',
    totalAmount: order.paymentAmount,
    lines: draft.lines.map((line) => ({ ...line })),
    buyerName: draft.buyerName.trim(),
    buyerPhone: draft.buyerPhone.trim(),
    paymentMethod: draft.paymentMethod,
    createdAt: new Date().toISOString(),
  };

  writeRealOrder(result);
  return result;
}

export function createQrshopRealService(): QrshopService {
  return {
    async getCatalog(): Promise<ListResult<QrshopProduct>> {
      const response = await fetch('/api/v1/qrshop/catalog');
      const payload = (await response.json().catch(() => null)) as
        | { status: 'success' | 'error'; message?: string; data?: ListResult<QrshopProduct> }
        | null;
      if (!response.ok || !payload || payload.status !== 'success' || !payload.data) {
        throw new Error(payload?.message ?? '상품을 불러오지 못했습니다.');
      }
      return payload.data;
    },

    async createOrder(draft: QrshopOrderDraft): Promise<QrshopOrderResult> {
      if (draft.paymentMethod === 'on-site') return createRealOnsiteOrder(draft);
      return qrshopMockService.createOrder(draft);
    },

    async getOrder(orderId: string): Promise<QrshopOrderResult> {
      if (!isRealOrderId(orderId)) return qrshopMockService.getOrder(orderId);
      const order = readRealOrders()[orderId];
      if (!order) throw new Error('주문 정보를 찾을 수 없습니다.');
      return order;
    },

    async processPayment(orderId: string, outcome: QrshopPaymentOutcome): Promise<QrshopOrderResult> {
      if (!isRealOrderId(orderId)) return qrshopMockService.processPayment(orderId, outcome);
      // 현장결제 주문은 접수 시점에 이미 끝났으므로 여기선 상태를 그대로 반환한다.
      const order = readRealOrders()[orderId];
      if (!order) throw new Error('결제할 주문 정보를 찾을 수 없습니다.');
      return order;
    },
  };
}

export const qrshopRealService = createQrshopRealService();
