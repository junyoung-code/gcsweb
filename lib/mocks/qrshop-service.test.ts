import { beforeEach, describe, expect, it } from 'vitest';
import { clearQrshopMockOrders, createQrshopMockService } from './qrshop-service';

const draft = {
  lines: [
    {
      productId: 'keyring-black',
      productName: '무슨무슨 키링',
      option: 'BLACK',
      quantity: 2,
      unitPrice: 15_000,
    },
  ],
  buyerName: '김잇장',
  buyerPhone: '010-1234-5678',
  paymentMethod: 'online' as const,
};

describe('QRshop Mock Service', () => {
  beforeEach(() => clearQrshopMockOrders());

  it('카탈로그 정상·빈 상태를 같은 계약으로 반환한다', async () => {
    const normal = createQrshopMockService({ delayMs: 0 });
    const empty = createQrshopMockService({
      catalogScenario: { kind: 'empty', data: { items: [], total: 0 } },
      delayMs: 0,
    });

    await expect(normal.getCatalog()).resolves.toEqual(
      expect.objectContaining({ total: expect.any(Number), storeStatus: 'open' }),
    );
    await expect(empty.getCatalog()).resolves.toEqual({ items: [], total: 0, storeStatus: 'open' });
  });

  it('결제 확인용 재조회에서만 선택한 옵션의 Mock 재고 변경을 반환한다', async () => {
    const service = createQrshopMockService({ delayMs: 0, soldOutOnRefreshIds: ['keyring-black'] });
    const initial = await service.getCatalog();
    const repeatedInitial = await service.getCatalog();
    const refreshed = await service.getCatalog({ refresh: true });
    expect(initial.items.find((item) => item.id === 'keyring-black')?.soldOut).toBeFalsy();
    expect(repeatedInitial.items.find((item) => item.id === 'keyring-black')?.soldOut).toBeFalsy();
    expect(refreshed.items.find((item) => item.id === 'keyring-black')?.soldOut).toBe(true);
    expect(refreshed.items.find((item) => item.id === 'tshirt-small')?.soldOut).toBeFalsy();
  });

  it('결제 확인용 재조회에서 상점이 닫힌 상태를 반환할 수 있다', async () => {
    const service = createQrshopMockService({ delayMs: 0, storeStatusOnRefresh: 'closed' });
    expect((await service.getCatalog()).storeStatus).toBe('open');
    expect((await service.getCatalog({ refresh: true })).storeStatus).toBe('closed');
  });

  it('닫힌 상점도 상품을 반환하지만 주문 생성은 거절한다', async () => {
    const service = createQrshopMockService({ delayMs: 0, storeStatus: 'closed' });
    const catalog = await service.getCatalog();
    expect(catalog.storeStatus).toBe('closed');
    expect(catalog.items.length).toBeGreaterThan(0);
    await expect(service.createOrder(draft)).rejects.toThrow('상점이 아직 오픈되지 않았어요!');
    expect(sessionStorage.getItem('gcs:qrshop:mock-orders')).toBeNull();
  });

  it('카탈로그 오류 상태를 전달한다', async () => {
    const service = createQrshopMockService({
      catalogScenario: { kind: 'error', message: '카탈로그 오류' },
      delayMs: 0,
    });

    await expect(service.getCatalog()).rejects.toThrow('카탈로그 오류');
  });

  it('주문 합계를 계산하고 결제 실패 후 성공으로 재시도한다', async () => {
    const service = createQrshopMockService({ delayMs: 0 });
    const created = await service.createOrder(draft);

    expect(created).toEqual(
      expect.objectContaining({
        status: 'pending',
        totalAmount: 30_000,
        buyerName: '김잇장',
      }),
    );

    const failed = await service.processPayment(created.orderId, 'failure');
    expect(failed.status).toBe('failed');
    expect(failed.failureMessage).toContain('실패');

    const paid = await service.processPayment(created.orderId, 'success');
    expect(paid.status).toBe('paid');
    expect(paid.failureMessage).toBeUndefined();
    await expect(service.getOrder(created.orderId)).resolves.toEqual(
      expect.objectContaining({ status: 'paid' }),
    );
  });

  it('주문자 정보가 올바르지 않으면 주문을 만들지 않는다', async () => {
    const service = createQrshopMockService({ delayMs: 0 });
    await expect(
      service.createOrder({ ...draft, buyerPhone: '1234' }),
    ).rejects.toThrow('휴대폰 번호');
  });
});
