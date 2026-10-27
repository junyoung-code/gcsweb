import { describe, expect, it, vi } from 'vitest';
import { buildOrderName, mergeOrderItems, validateOrderItems } from './order-validation';

const store = { storeId: 's1', name: '열반급행', storeSlug: 'nirvanaexpress' };

const keyring = {
  productId: 'p-keyring',
  name: '키캡키링 A',
  price: 5000,
  hasOption: true,
  currentStock: 10,
  options: [
    { optionId: 'o-day1', name: '1일차', surcharge: 1000, currentStock: 3 },
    { optionId: 'o-day4', name: '4일차', surcharge: 0, currentStock: 0 },
  ],
};
const postcard = { productId: 'p-postcard', name: '엽서 A', price: 2000, hasOption: false, currentStock: 5, options: [] };

const makeClient = (found = store as typeof store | null, products = [keyring, postcard]) => {
  const findMany = vi.fn().mockResolvedValue(products);
  return {
    client: {
      store: { findUnique: vi.fn().mockResolvedValue(found) },
      onsiteProduct: { findMany },
    } as never,
    findMany,
  };
};

describe('mergeOrderItems', () => {
  it('같은 상품·옵션은 수량을 합산하고 순서를 유지한다', () => {
    expect(
      mergeOrderItems([
        { productId: 'a', optionId: 'x', quantity: 1 },
        { productId: 'b', quantity: 2 },
        { productId: 'a', optionId: 'x', quantity: 3 },
        { productId: 'a', optionId: 'y', quantity: 1 },
      ]),
    ).toEqual([
      { productId: 'a', optionId: 'x', quantity: 4 },
      { productId: 'b', optionId: null, quantity: 2 },
      { productId: 'a', optionId: 'y', quantity: 1 },
    ]);
  });
});

describe('buildOrderName', () => {
  it('한 건이면 상품명, 여러 건이면 "외 N건"', () => {
    expect(buildOrderName([{ productName: '엽서 A' }])).toBe('엽서 A');
    expect(buildOrderName([{ productName: '엽서 A' }, { productName: '키링' }, { productName: '반다나' }])).toBe('엽서 A 외 2건');
    expect(buildOrderName([])).toBe('');
  });
});

describe('validateOrderItems (주문 항목 검증·가격 계산)', () => {
  it('단가 = 기본가 + 옵션 추가금으로 서버가 금액을 계산한다', async () => {
    const { client } = makeClient();
    const result = await validateOrderItems(client, {
      storeSlug: 'nirvanaexpress',
      items: [
        { productId: 'p-keyring', optionId: 'o-day1', quantity: 2 },
        { productId: 'p-postcard', quantity: 1 },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      store,
      paymentAmount: 6000 * 2 + 2000,
      orderName: '키캡키링 A 외 1건',
    });
    if (result.ok) {
      expect(result.lines).toEqual([
        { productId: 'p-keyring', optionId: 'o-day1', productName: '키캡키링 A', optionName: '1일차', unitPrice: 6000, quantity: 2 },
        { productId: 'p-postcard', optionId: null, productName: '엽서 A', optionName: null, unitPrice: 2000, quantity: 1 },
      ]);
    }
  });

  it('같은 항목이 여러 행이면 합산한 수량으로 재고를 본다', async () => {
    const { client } = makeClient();
    const result = await validateOrderItems(client, {
      storeSlug: 'nirvanaexpress',
      items: [
        { productId: 'p-postcard', quantity: 3 },
        { productId: 'p-postcard', quantity: 3 },
      ],
    });
    expect(result).toEqual({
      ok: false,
      reason: 'SOLD_OUT',
      soldOutItems: [{ productId: 'p-postcard', optionId: null, name: '엽서 A' }],
    });
  });

  it('상점이 없으면 상품을 조회하지 않는다', async () => {
    const { client, findMany } = makeClient(null);
    expect(await validateOrderItems(client, { storeSlug: 'nope1', items: [{ productId: 'p-postcard', quantity: 1 }] })).toEqual({
      ok: false,
      reason: 'STORE_NOT_FOUND',
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('해당 상점의 상품만 조회한다', async () => {
    const { client, findMany } = makeClient();
    await validateOrderItems(client, { storeSlug: 'nirvanaexpress', items: [{ productId: 'p-postcard', quantity: 1 }] });
    expect(findMany.mock.calls[0][0].where).toEqual({ storeId: 's1', productId: { in: ['p-postcard'] } });
  });

  it.each([
    ['상점 상품이 아니면', { productId: 'other', quantity: 1 }, 'PRODUCT_NOT_FOUND'],
    ['옵션 상품에 옵션이 없으면', { productId: 'p-keyring', quantity: 1 }, 'OPTION_REQUIRED'],
    ['옵션 없는 상품에 옵션을 주면', { productId: 'p-postcard', optionId: 'o-day1', quantity: 1 }, 'OPTION_NOT_ALLOWED'],
    ['다른 상품의 옵션이면', { productId: 'p-keyring', optionId: 'o-other', quantity: 1 }, 'OPTION_NOT_FOUND'],
  ])('%s 거절한다', async (_label, item, reason) => {
    const { client } = makeClient();
    expect(await validateOrderItems(client, { storeSlug: 'nirvanaexpress', items: [item] })).toEqual({ ok: false, reason });
  });

  it('품절 항목을 모두 모아서 돌려준다 (옵션 재고 기준)', async () => {
    const { client } = makeClient();
    const result = await validateOrderItems(client, {
      storeSlug: 'nirvanaexpress',
      items: [
        { productId: 'p-keyring', optionId: 'o-day4', quantity: 1 },
        { productId: 'p-keyring', optionId: 'o-day1', quantity: 4 },
        { productId: 'p-postcard', quantity: 5 },
      ],
    });
    expect(result).toEqual({
      ok: false,
      reason: 'SOLD_OUT',
      soldOutItems: [
        { productId: 'p-keyring', optionId: 'o-day4', name: '키캡키링 A' },
        { productId: 'p-keyring', optionId: 'o-day1', name: '키캡키링 A' },
      ],
    });
  });

  it('재고와 수량이 같으면 주문할 수 있다', async () => {
    const { client } = makeClient();
    const result = await validateOrderItems(client, {
      storeSlug: 'nirvanaexpress',
      items: [{ productId: 'p-postcard', quantity: 5 }],
    });
    expect(result.ok).toBe(true);
  });
});
