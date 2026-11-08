import type { QrshopCatalogResult, QrshopService } from './qrshop-service';
import type { QrshopOrderResult, QrshopProduct } from '@/types/qrshop';
import { checkPaymentStorage, readPaymentSession, savePaymentSession } from '@/lib/qrshop/payment-session';

// Contract: upstream/main, app/api/v2/qrshop/route.ts. No opening-status field exists.
type CatalogResponse = {
  store: { storeId: string; name: string; storeSlug: string };
  categories: { categoryId: string; name: string }[];
  products: {
    productId: string; name: string; price: number; imageUrl: string | null;
    categoryId: string | null; hasOption: boolean; soldOut: boolean; stock: number | null;
    options: { optionId: string; name: string; surcharge: number; stock: number; soldOut: boolean }[];
  }[];
};

type CreatedOrder = {
  orderId: string; orderNo: number; paymentAmount: number; guestToken: string;
  payment: { storeId: string; channelKey: string; orderName: string };
};
type ServerOrder = {
  orderId: string; orderNo: number | null; paymentAmount: number;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED';
  failureCode: string | null; failureMessage: string | null; orderedAt: string;
  store: { name: string; storeSlug: string };
  items: { name: string; optionName: string | null; unitPrice: number; quantity: number; soldOut: boolean }[];
};

export class QrshopApiError extends Error {
  constructor(message: string, public code?: string, public status?: number) { super(message); }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== 'success' || !body.data) {
    throw new QrshopApiError(body?.message ?? '주문·결제 정보를 확인하지 못했습니다. 다시 확인해주세요.', body?.code, response.status);
  }
  return body.data as T;
}

export function createQrshopApiService(storeSlug: string): QrshopService {
  const validateStore = () => {
    if (!/^[a-z0-9]{4,}$/.test(storeSlug)) throw new Error('유효하지 않은 상점 아이디입니다.');
  };
  const orderUrl = (orderId: string) => `/api/v2/qrshop/orders/${encodeURIComponent(orderId)}`;
  const getOrder = async (orderId: string): Promise<QrshopOrderResult> => {
    validateStore();
    const { guestToken } = readPaymentSession(orderId, storeSlug);
    const data = await readResponse<ServerOrder>(await fetch(orderUrl(orderId), {
      cache: 'no-store', headers: { 'X-Guest-Token': guestToken },
    }));
    if (data.orderId !== orderId || data.store.storeSlug !== storeSlug) throw new Error('주문 상점 정보를 확인할 수 없습니다.');
    return {
      orderId: data.orderId, orderCode: data.paymentStatus === 'PAID' && !data.failureCode ? String(data.orderNo ?? '') : '',
      status: data.failureCode === 'REFUND_PENDING' ? 'refund-pending' :
        data.paymentStatus === 'PAID' && !data.failureCode && data.orderNo ? 'paid' :
          data.paymentStatus === 'CANCELED' ? 'canceled' : data.paymentStatus === 'FAILED' ? 'failed' : 'pending',
      totalAmount: data.paymentAmount, createdAt: data.orderedAt, storeSlug: data.store.storeSlug,
      failureCode: data.failureCode ?? undefined, failureMessage: data.failureMessage ?? undefined,
      buyerName: '', buyerPhone: '', paymentMethod: 'online',
      lines: data.items.map((item, index) => ({ productId: `order-line-${index}`, productName: item.name,
        option: item.optionName ?? undefined, unitPrice: item.unitPrice, quantity: item.quantity, soldOut: item.soldOut })),
    };
  };
  const verifyPayment = async (orderId: string): Promise<QrshopOrderResult> => {
    validateStore();
    const { guestToken } = readPaymentSession(orderId, storeSlug);
    try {
      await readResponse(await fetch(`${orderUrl(orderId)}/payment/verify`, {
        method: 'POST', headers: { 'X-Guest-Token': guestToken },
      }));
    } catch (error) {
      // A stock refund is a non-success result, whose full reason comes from GET.
      if (!(error instanceof QrshopApiError) || error.code !== 'STOCK_SHORTAGE') throw error;
    }
    return getOrder(orderId);
  };
  return {
    dataSource: 'api',
    async getCatalog(): Promise<QrshopCatalogResult> {
      validateStore();
      const response = await fetch(`/api/v2/qrshop?storeSlug=${encodeURIComponent(storeSlug)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== 'success' || !body.data) {
        throw new Error(body?.message ?? '상품을 불러오지 못했습니다. 다시 시도해주세요.');
      }
      const data = body.data as CatalogResponse;
      const items = data.products.flatMap<QrshopProduct>((product) => {
        const common = {
          sourceProductId: product.productId,
          name: product.name,
          categoryId: product.categoryId ?? 'uncategorized',
          categoryName: data.categories.find(category => category.categoryId === product.categoryId)?.name ?? '미분류',
          imageUrl: product.imageUrl ?? undefined,
          basePrice: product.price,
        };
        if (!product.hasOption || product.options.length === 0) return [{
          ...common, id: product.productId, price: product.price,
          stock: product.hasOption ? 0 : product.stock ?? 0, soldOut: product.soldOut || (product.stock ?? 0) <= 0,
        }];
        // Option stock is independent. The contract intentionally has no shared product stock cap.
        return product.options.map(option => ({
          ...common, id: `${product.productId}:${option.optionId}`, optionId: option.optionId,
          option: option.name, price: product.price + option.surcharge,
          stock: option.stock, soldOut: product.soldOut || option.soldOut || option.stock <= 0,
        }));
      });
      return {
        items, total: items.length, store: data.store, storeStatus: 'unknown',
        categories: data.categories.map(category => ({ id: category.categoryId, name: category.name })),
      };
    },
    async createOrder(draft) {
      validateStore();
      if (draft.termsAgreed !== true || !draft.lines.length) throw new Error('상품 선택과 약관 동의를 확인해주세요.');
      checkPaymentStorage();
      const data = await readResponse<CreatedOrder>(await fetch(`/api/v2/qrshop/orders?storeSlug=${encodeURIComponent(storeSlug)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termsAgreed: true, items: draft.lines.map(line => ({
          productId: line.sourceProductId ?? line.productId, optionId: line.optionId ?? null, quantity: line.quantity,
        })) }),
      }));
      if (!data.orderId || !data.guestToken || !data.payment?.storeId || !data.payment.channelKey || !data.payment.orderName || !Number.isSafeInteger(data.paymentAmount) || data.paymentAmount < 0) {
        throw new Error('결제 정보를 확인할 수 없어 결제를 시작하지 않았습니다.');
      }
      savePaymentSession(data.orderId, { storeSlug, guestToken: data.guestToken, payment: data.payment });
      return { orderId: data.orderId, orderCode: '', status: 'pending', totalAmount: data.paymentAmount,
        lines: [], buyerName: '', buyerPhone: '', paymentMethod: 'online', createdAt: '', storeSlug };
    },
    getOrder,
    verifyPayment,
    async startPayment(orderId, signal, buyerEmail, buyerPhone, buyerName) {
      const order = await verifyPayment(orderId);
      signal?.throwIfAborted();
      if (order.status !== 'pending' && order.status !== 'failed') return order;
      const { payment, guestToken } = readPaymentSession(orderId, storeSlug);
      const phoneNumber = buyerPhone?.replace(/[\s-]/g, '');
      const sdkError = (reason: unknown) => {
        const detail = reason && typeof reason === 'object' ? reason as { code?: unknown; message?: unknown } : {};
        const redact = (value: string) => [guestToken, payment.channelKey, payment.storeId, orderId, buyerEmail?.trim() ?? '', buyerPhone ?? '', phoneNumber ?? '', buyerName?.trim() ?? '']
          .reduce((text, secret) => secret ? text.split(secret).join('[REDACTED]') : text, value)
          .replace(/https?:\/\/\S+/g, '[URL]').slice(0, 500);
        const code = redact(typeof detail.code === 'string' ? detail.code : 'SDK_ERROR');
        const message = redact(typeof detail.message === 'string' ? detail.message : '결제창을 열지 못했습니다.');
        return new QrshopApiError(`결제창 오류 [${code}]: ${message}`, code);
      };
      const redirectUrl = new URL('/QRshop/result', window.location.origin);
      redirectUrl.searchParams.set('orderId', orderId);
      redirectUrl.searchParams.set('storeSlug', storeSlug);
      const { requestPayment } = await import('@portone/browser-sdk/v2');
      signal?.throwIfAborted();
      let paymentError: QrshopApiError | undefined;
      try {
        const response = await requestPayment({ ...payment, paymentId: orderId, totalAmount: order.totalAmount,
          currency: 'CURRENCY_KRW', payMethod: 'CARD', redirectUrl: redirectUrl.toString(),
          ...(buyerEmail || phoneNumber || buyerName ? { customer: { email: buyerEmail?.trim(), phoneNumber, fullName: buyerName?.trim() } } : {}) });
        if (response?.code != null) paymentError = sdkError(response);
      } catch (reason) { paymentError = sdkError(reason); }
      signal?.throwIfAborted();
      // SDK errors do not override a payment already confirmed by the server.
      const result = await verifyPayment(orderId);
      if (paymentError && (result.status === 'pending' || result.status === 'failed')) throw paymentError;
      return result;
    },
    async processPayment() { throw new Error('실제 결제는 결제창과 서버 검증으로만 처리합니다.'); },
  };
}
