import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));

import { CANCEL_REASON_STOCK_SHORTAGE, PENDING_EXPIRE_MS, confirmOrderPayment, settleStalePendingOrder } from './payment-confirm';

type Item = {
  quantity: number;
  onsiteProductId: string | null;
  onsiteOptionId: string | null;
  onsiteProductName: string | null;
  onsiteOptionName: string | null;
};

const optionItem: Item = {
  quantity: 2,
  onsiteProductId: 'p1',
  onsiteOptionId: 'o1',
  onsiteProductName: '키캡키링 A',
  onsiteOptionName: '4일차',
};
const plainItem: Item = {
  quantity: 1,
  onsiteProductId: 'p2',
  onsiteOptionId: null,
  onsiteProductName: '엽서 A',
  onsiteOptionName: null,
};

const baseOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'ord1',
  paymentStatus: 'PENDING',
  paymentAmount: 12000,
  cancelReason: null,
  orderNumber: { type: 'ONSITE' },
  items: [optionItem, plainItem],
  ...overrides,
});

const NOW = new Date('2026-04-03T03:00:00Z');

function setup(order: unknown, opts: { currentStatus?: string; optionCount?: number; productCounts?: number[] } = {}) {
  const productCounts = [...(opts.productCounts ?? [1, 1])];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    order: {
      findUnique: vi.fn().mockResolvedValue({ paymentStatus: opts.currentStatus ?? 'PENDING', cancelReason: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    onsiteProductOption: {
      updateMany: vi.fn().mockResolvedValue({ count: opts.optionCount ?? 1 }),
      findUnique: vi.fn().mockResolvedValue({ currentStock: 1 }),
    },
    onsiteProduct: {
      updateMany: vi.fn().mockImplementation(async () => ({ count: productCounts.shift() ?? 1 })),
      findUnique: vi.fn().mockResolvedValue({ currentStock: 0 }),
    },
  };
  const db = {
    order: { findUnique: vi.fn().mockResolvedValue(order), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const getPayment = vi.fn().mockResolvedValue({ success: true, status: 'PAID', amount: { total: 12000 }, impUid: 'imp_1' });
  const cancelPayment = vi.fn().mockResolvedValue({ success: true });
  const deps = { db: db as never, getPayment, cancelPayment, now: () => NOW } as never;
  return { tx, db, getPayment, cancelPayment, deps };
}

describe('confirmOrderPayment', () => {
  it('주문이 없거나 QR샵 주문(OrderNumber)이 아니면 NOT_FOUND', async () => {
    expect(await confirmOrderPayment('x', setup(null).deps)).toEqual({ kind: 'NOT_FOUND' });
    expect(await confirmOrderPayment('x', setup(baseOrder({ orderNumber: null })).deps)).toEqual({ kind: 'NOT_FOUND' });
  });

  it('이미 PAID 면 PortOne 조회 없이 alreadyPaid', async () => {
    const t = setup(baseOrder({ paymentStatus: 'PAID' }));
    expect(await confirmOrderPayment('ord1', t.deps)).toEqual({ kind: 'PAID', alreadyPaid: true });
    expect(t.getPayment).not.toHaveBeenCalled();
  });

  it('CANCELED 주문은 CLOSED', async () => {
    const t = setup(baseOrder({ paymentStatus: 'CANCELED', cancelReason: CANCEL_REASON_STOCK_SHORTAGE }));
    expect(await confirmOrderPayment('ord1', t.deps)).toEqual({
      kind: 'CLOSED',
      paymentStatus: 'CANCELED',
      cancelReason: CANCEL_REASON_STOCK_SHORTAGE,
    });
    expect(t.getPayment).not.toHaveBeenCalled();
  });

  it('시간 초과로 FAILED 가 된 주문도 결제가 확인되면 재고를 차감하고 PAID 로 살린다', async () => {
    const t = setup(baseOrder({ paymentStatus: 'FAILED' }), { currentStatus: 'FAILED' });
    expect(await confirmOrderPayment('ord1', t.deps)).toEqual({ kind: 'PAID', alreadyPaid: false });
    expect(t.tx.onsiteProductOption.updateMany).toHaveBeenCalled();
    expect(t.tx.order.update).toHaveBeenCalledWith({
      where: { id: 'ord1' },
      data: { paymentStatus: 'PAID', impUid: 'imp_1' },
    });
  });

  it('FAILED 주문이 PortOne 에서도 결제 전이면 그대로 NOT_PAID', async () => {
    const t = setup(baseOrder({ paymentStatus: 'FAILED' }));
    t.getPayment.mockResolvedValue({ success: true, status: 'FAILED', amount: { total: 12000 } });
    expect(await confirmOrderPayment('ord1', t.deps)).toEqual({
      kind: 'NOT_PAID',
      paymentStatus: 'FAILED',
      portoneStatus: 'FAILED',
    });
    expect(t.db.$transaction).not.toHaveBeenCalled();
  });

  it('결제 건이 PortOne 에 없으면 NOT_PAID, 조회 자체가 실패하면 LOOKUP_FAILED', async () => {
    const a = setup(baseOrder());
    a.getPayment.mockResolvedValue({ success: false, notFound: true });
    expect(await confirmOrderPayment('ord1', a.deps)).toEqual({ kind: 'NOT_PAID', paymentStatus: 'PENDING' });

    const b = setup(baseOrder());
    b.getPayment.mockResolvedValue({ success: false, code: 'API_ERROR', message: 'boom' });
    expect(await confirmOrderPayment('ord1', b.deps)).toEqual({ kind: 'LOOKUP_FAILED', code: 'API_ERROR', message: 'boom' });
    expect(b.db.$transaction).not.toHaveBeenCalled();
  });

  it('PortOne 금액이 주문 금액과 다르면 AMOUNT_MISMATCH (차감하지 않음)', async () => {
    const t = setup(baseOrder());
    t.getPayment.mockResolvedValue({ success: true, status: 'PAID', amount: { total: 1 } });
    expect(await confirmOrderPayment('ord1', t.deps)).toEqual({ kind: 'AMOUNT_MISMATCH' });
    expect(t.db.$transaction).not.toHaveBeenCalled();
  });

  it('PortOne 상태가 PAID 가 아니면 NOT_PAID', async () => {
    const t = setup(baseOrder());
    t.getPayment.mockResolvedValue({ success: true, status: 'READY', amount: { total: 12000 } });
    expect(await confirmOrderPayment('ord1', t.deps)).toEqual({ kind: 'NOT_PAID', paymentStatus: 'PENDING', portoneStatus: 'READY' });
    expect(t.db.$transaction).not.toHaveBeenCalled();
  });

  it('결제 확인되면 옵션·상품 재고를 조건부로 차감하고 PAID 로 바꾼다', async () => {
    const t = setup(baseOrder());
    expect(await confirmOrderPayment('ord1', t.deps)).toEqual({ kind: 'PAID', alreadyPaid: false });

    expect(t.getPayment).toHaveBeenCalledWith('ord1');
    expect(t.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(t.tx.onsiteProductOption.updateMany).toHaveBeenCalledWith({
      where: { optionId: 'o1', currentStock: { gte: 2 } },
      data: { currentStock: { decrement: 2 } },
    });
    // 옵션 상품(p1)과 옵션 없는 상품(p2) 모두 상품 재고를 줄인다.
    expect(t.tx.onsiteProduct.updateMany.mock.calls.map((c) => c[0].where.productId)).toEqual(['p1', 'p2']);
    expect(t.tx.order.update).toHaveBeenCalledWith({
      where: { id: 'ord1' },
      data: { paymentStatus: 'PAID', impUid: 'imp_1' },
    });
    expect(t.cancelPayment).not.toHaveBeenCalled();
  });

  it('잠금 후 다시 읽었을 때 이미 PAID 면 차감하지 않는다 (verify·웹훅 동시 도착)', async () => {
    const t = setup(baseOrder(), { currentStatus: 'PAID' });
    expect(await confirmOrderPayment('ord1', t.deps)).toEqual({ kind: 'PAID', alreadyPaid: true });
    expect(t.tx.onsiteProduct.updateMany).not.toHaveBeenCalled();
    expect(t.tx.order.update).not.toHaveBeenCalled();
  });

  it('재고가 모자라면 전액 환불하고 CANCELED 로 기록한다', async () => {
    const t = setup(baseOrder(), { optionCount: 0 });
    const result = await confirmOrderPayment('ord1', t.deps);

    expect(result).toEqual({
      kind: 'STOCK_SHORTAGE',
      refunded: true,
      // 옵션 재고 1개가 남았지만 주문 수량(2)보다 적다 → 품절임박
      soldOutItems: [{ productId: 'p1', optionId: 'o1', name: '키캡키링 A', optionName: '4일차', availableQuantity: 1 }],
    });
    expect(t.tx.order.update).not.toHaveBeenCalled();
    expect(t.cancelPayment).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'ord1' }));
    expect(t.db.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'ord1', paymentStatus: { in: ['PENDING', 'FAILED'] } },
      data: { paymentStatus: 'CANCELED', canceledAt: NOW, cancelReason: CANCEL_REASON_STOCK_SHORTAGE },
    });
  });

  it('상품 재고 차감이 실패해도 품절로 처리한다', async () => {
    const t = setup(baseOrder({ items: [plainItem] }), { productCounts: [0] });
    const result = await confirmOrderPayment('ord1', t.deps);
    expect(result).toMatchObject({
      kind: 'STOCK_SHORTAGE',
      soldOutItems: [{ productId: 'p2', optionId: null, name: '엽서 A', optionName: null, availableQuantity: 0 }],
    });
  });

  it('삭제돼 FK 가 비어 있는 항목은 품절로 본다', async () => {
    const deletedProduct: Item = { ...plainItem, onsiteProductId: null };
    const deletedOption: Item = { ...optionItem, onsiteOptionId: null };
    const t = setup(baseOrder({ items: [deletedProduct, deletedOption] }));
    const result = await confirmOrderPayment('ord1', t.deps);

    expect(result).toMatchObject({
      kind: 'STOCK_SHORTAGE',
      soldOutItems: [
        { productId: null, optionId: null, name: '엽서 A', optionName: null, availableQuantity: 0 },
        { productId: 'p1', optionId: null, name: '키캡키링 A', optionName: '4일차', availableQuantity: 0 },
      ],
    });
    expect(t.tx.onsiteProductOption.updateMany).not.toHaveBeenCalled();
    expect(t.tx.onsiteProduct.updateMany).not.toHaveBeenCalled();
  });

  it('환불 호출이 실패하면 주문은 PENDING 으로 두고 refundFailedAt 을 남긴다', async () => {
    const t = setup(baseOrder(), { optionCount: 0 });
    t.cancelPayment.mockResolvedValue({ success: false, code: 'API_ERROR', message: 'fail' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await confirmOrderPayment('ord1', t.deps);
    spy.mockRestore();

    expect(result).toMatchObject({ kind: 'STOCK_SHORTAGE', refunded: false });
    expect(t.db.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'ord1', paymentStatus: { in: ['PENDING', 'FAILED'] } },
      data: { refundFailedAt: NOW, cancelReason: CANCEL_REASON_STOCK_SHORTAGE },
    });
  });

  it('재고 부족이 아닌 오류는 그대로 던진다', async () => {
    const t = setup(baseOrder());
    t.tx.onsiteProductOption.updateMany.mockRejectedValue(new Error('db down'));
    await expect(confirmOrderPayment('ord1', t.deps)).rejects.toThrow('db down');
    expect(t.cancelPayment).not.toHaveBeenCalled();
  });
});

describe('settleStalePendingOrder', () => {
  const stale = (overrides: Record<string, unknown> = {}) => ({
    id: 'ord1',
    paymentStatus: 'PENDING' as const,
    createdAt: new Date(NOW.getTime() - PENDING_EXPIRE_MS - 1),
    refundFailedAt: null,
    ...overrides,
  });

  it('10분이 안 지났으면 PortOne 을 조회하지 않는다', async () => {
    const t = setup(baseOrder());
    const fresh = stale({ createdAt: new Date(NOW.getTime() - PENDING_EXPIRE_MS + 1000) });
    expect(await settleStalePendingOrder(fresh, t.deps)).toBe(false);
    expect(t.getPayment).not.toHaveBeenCalled();
  });

  it('PENDING 이 아니거나 환불 실패 대기 주문이면 건드리지 않는다', async () => {
    const t = setup(baseOrder());
    expect(await settleStalePendingOrder(stale({ paymentStatus: 'PAID' }), t.deps)).toBe(false);
    expect(await settleStalePendingOrder(stale({ refundFailedAt: NOW }), t.deps)).toBe(false);
    expect(t.getPayment).not.toHaveBeenCalled();
  });

  it('10분 지났고 PortOne 에서 결제됐으면 확정한다', async () => {
    const t = setup(baseOrder());
    expect(await settleStalePendingOrder(stale(), t.deps)).toBe(true);
    expect(t.tx.order.update).toHaveBeenCalledWith({
      where: { id: 'ord1' },
      data: { paymentStatus: 'PAID', impUid: 'imp_1' },
    });
    expect(t.db.order.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['결제 건 없음(결제창 이탈)', { success: false, notFound: true }],
    ['결제창만 열고 미결제', { success: true, status: 'READY', amount: { total: 12000 } }],
    ['PG 승인 실패', { success: true, status: 'FAILED', amount: { total: 12000 } }],
  ])('10분 지났고 %s 이면 FAILED 로 바꾼다', async (_label, payment) => {
    const t = setup(baseOrder());
    t.getPayment.mockResolvedValue(payment);
    expect(await settleStalePendingOrder(stale(), t.deps)).toBe(true);
    expect(t.db.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'ord1', paymentStatus: 'PENDING', refundFailedAt: null },
      data: { paymentStatus: 'FAILED' },
    });
  });

  it('PortOne 조회가 실패하면 상태를 바꾸지 않는다', async () => {
    const t = setup(baseOrder());
    t.getPayment.mockResolvedValue({ success: false, code: 'API_ERROR', message: 'boom' });
    expect(await settleStalePendingOrder(stale(), t.deps)).toBe(false);
    expect(t.db.order.updateMany).not.toHaveBeenCalled();
  });
});
