// Credentials stay in this tab, keyed by order; never return them in an order view model.
type PaymentSession = {
  storeSlug: string;
  guestToken: string;
  payment: { storeId: string; channelKey: string; orderName: string };
  returnedToCatalog?: boolean;
};

const prefix = 'gcs:qrshop:payment:';
export const PAYMENT_SESSION_MISSING = '이 탭의 주문 인증 정보를 찾을 수 없습니다. 결제를 시작한 탭에서 다시 확인해주세요.';
export const PAYMENT_SESSION_UNAVAILABLE = '주문 인증 정보를 안전하게 저장할 수 없습니다. 브라우저의 세션 저장을 허용한 뒤 다시 시도해주세요.';

export function checkPaymentStorage(): void {
  try {
    const key = `${prefix}storage-check`;
    window.sessionStorage.setItem(key, key);
    if (window.sessionStorage.getItem(key) !== key) throw new Error();
    window.sessionStorage.removeItem(key);
  } catch { throw new Error(PAYMENT_SESSION_UNAVAILABLE); }
}

export function savePaymentSession(orderId: string, session: PaymentSession): void {
  try {
    const key = prefix + orderId;
    const value = JSON.stringify(session);
    window.sessionStorage.setItem(key, value);
    if (window.sessionStorage.getItem(key) !== value) throw new Error();
  } catch {
    throw new Error('주문은 생성되었지만 인증 정보 저장에 실패해 결제를 시작하지 않았습니다. ' + PAYMENT_SESSION_UNAVAILABLE);
  }
}

export function readPaymentSession(orderId: string, storeSlug: string): PaymentSession {
  try {
    const value = window.sessionStorage.getItem(prefix + orderId);
    const session: PaymentSession | null = value ? JSON.parse(value) : null;
    if (session?.storeSlug === storeSlug && session.guestToken && session.payment?.storeId && session.payment.channelKey && session.payment.orderName) return session;
  } catch { /* Missing, corrupt, or blocked storage must never fall back to Mock. */ }
  throw new Error(PAYMENT_SESSION_MISSING);
}

const returnPrefix = 'gcs:qrshop:return:';

// Only called from a server-confirmed paid result. The catalog rechecks the order
// before displaying its number; this marker is never evidence of payment.
export function queuePaymentReturn(orderId: string, storeSlug: string): void {
  try {
    const session = readPaymentSession(orderId, storeSlug);
    if (session.returnedToCatalog) return;
    savePaymentSession(orderId, { ...session, returnedToCatalog: true });
    window.sessionStorage.setItem(returnPrefix + storeSlug, orderId);
  } catch { /* A blocked store must not prevent returning to the catalog. */ }
}

export function readPaymentReturn(storeSlug: string): string | null {
  try { return window.sessionStorage.getItem(returnPrefix + storeSlug); }
  catch { return null; }
}

export function consumePaymentReturn(storeSlug: string, orderId: string): boolean {
  try {
    if (readPaymentReturn(storeSlug) !== orderId) return false;
    window.sessionStorage.removeItem(returnPrefix + storeSlug);
    return true;
  } catch { return false; }
}
