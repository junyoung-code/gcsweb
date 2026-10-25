import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ORDER_PAYMENT_METHOD,
  ORDER_PAYMENT_STATUS,
  ORDER_RECEIPT_STATUS,
  isOnSitePaymentMethod,
  toOrderPaymentStatusLabel,
  toOrderReceiptStatusLabel,
} from '@/lib/order-status';

describe('order-status 값(Prisma enum과 동일)', () => {
  it('결제상태는 PENDING / PAID / CANCELED / FAILED', () => {
    expect(ORDER_PAYMENT_STATUS).toEqual({ PENDING: 'PENDING', PAID: 'PAID', CANCELED: 'CANCELED', FAILED: 'FAILED' });
  });

  it('수령상태는 NOT_RECEIVED / RECEIVED', () => {
    expect(ORDER_RECEIPT_STATUS).toEqual({ NOT_RECEIVED: 'NOT_RECEIVED', RECEIVED: 'RECEIVED' });
  });

  it('결제방법은 ONLINE / ON_SITE', () => {
    expect(ORDER_PAYMENT_METHOD).toEqual({ ONLINE: 'ONLINE', ON_SITE: 'ON_SITE' });
    expect(isOnSitePaymentMethod(ORDER_PAYMENT_METHOD.ON_SITE)).toBe(true);
    expect(isOnSitePaymentMethod(ORDER_PAYMENT_METHOD.ONLINE)).toBe(false);
  });
});

describe('toOrderPaymentStatusLabel', () => {
  const now = new Date('2026-10-19T12:00:00+09:00');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it('취소·실패·완료는 결제방법과 무관하게 같은 라벨', () => {
    for (const paymentMethod of [ORDER_PAYMENT_METHOD.ONLINE, ORDER_PAYMENT_METHOD.ON_SITE]) {
      expect(toOrderPaymentStatusLabel({ paymentMethod, paymentStatus: ORDER_PAYMENT_STATUS.CANCELED })).toBe('결제취소');
      expect(toOrderPaymentStatusLabel({ paymentMethod, paymentStatus: ORDER_PAYMENT_STATUS.FAILED })).toBe('결제실패');
      expect(toOrderPaymentStatusLabel({ paymentMethod, paymentStatus: ORDER_PAYMENT_STATUS.PAID })).toBe('결제완료');
    }
  });

  it('현장결제 대기는 미결제 — 수령 여부와 무관(결제와 수령은 별개 축)', () => {
    expect(
      toOrderPaymentStatusLabel({ paymentMethod: ORDER_PAYMENT_METHOD.ON_SITE, paymentStatus: ORDER_PAYMENT_STATUS.PENDING }),
    ).toBe('미결제');
  });

  it('온라인 대기는 60초 안이면 결제대기, 넘으면 결제실패(이탈)', () => {
    const base = { paymentMethod: ORDER_PAYMENT_METHOD.ONLINE, paymentStatus: ORDER_PAYMENT_STATUS.PENDING };
    expect(toOrderPaymentStatusLabel({ ...base, orderDate: new Date(now.getTime() - 30_000) })).toBe('결제대기');
    expect(toOrderPaymentStatusLabel({ ...base, orderDate: new Date(now.getTime() - 61_000) })).toBe('결제실패');
    expect(toOrderPaymentStatusLabel(base)).toBe('결제실패');
  });
});

describe('toOrderReceiptStatusLabel', () => {
  it('수령완료 / 미수령', () => {
    expect(toOrderReceiptStatusLabel(ORDER_RECEIPT_STATUS.RECEIVED)).toBe('수령완료');
    expect(toOrderReceiptStatusLabel(ORDER_RECEIPT_STATUS.NOT_RECEIVED)).toBe('미수령');
  });
});
