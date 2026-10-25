import { describe, expect, it } from 'vitest';
import { createOrderSchema } from '@/lib/validations/order';
import { ORDER_PAYMENT_METHOD } from '@/lib/order-status';

const items = [{ productId: 'p1', quantity: 1 }];

const buynow = (overrides: Record<string, unknown> = {}) => ({
  productType: 1,
  receiveMethod: 1,
  paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
  bagOption: false,
  isPolicyAgreed: true,
  items,
  ...overrides,
});

const fund = (overrides: Record<string, unknown> = {}) => ({
  productType: 0,
  receiveMethod: 1,
  receiverName: '홍길동',
  receiverPhone: '01012345678',
  ordererName: '홍길동',
  ordererPhone: '01012345678',
  paymentMethod: ORDER_PAYMENT_METHOD.ONLINE,
  cardCompany: 0,
  isPolicyAgreed: true,
  items,
  ...overrides,
});

const messages = (input: unknown) => {
  const result = createOrderSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('createOrderSchema 결제방법(ONLINE / ON_SITE)', () => {
  it('buynow는 온라인·현장 모두 허용', () => {
    expect(createOrderSchema.safeParse(buynow()).success).toBe(true);
    expect(createOrderSchema.safeParse(buynow({ paymentMethod: ORDER_PAYMENT_METHOD.ON_SITE })).success).toBe(true);
  });

  it('옛 숫자 값(0~3)과 enum 밖의 값은 거부', () => {
    for (const paymentMethod of [0, 1, 2, 3, 'CARD']) {
      expect(createOrderSchema.safeParse(buynow({ paymentMethod })).success).toBe(false);
    }
  });

  it('buynow는 세부 결제수단을 받지 않는다', () => {
    expect(messages(buynow({ cardCompany: 0 }))).toContain('INVALID_PAYMENT_DETAIL_COMBINATION');
  });

  it('현장결제는 buynow만 가능하고 세부 결제수단도 없어야 한다', () => {
    expect(messages(fund({ paymentMethod: ORDER_PAYMENT_METHOD.ON_SITE, cardCompany: null }))).toContain(
      'INVALID_PAYMENT_METHOD',
    );
    expect(messages(buynow({ paymentMethod: ORDER_PAYMENT_METHOD.ON_SITE, bankCode: 0 }))).toContain(
      'INVALID_PAYMENT_DETAIL_COMBINATION',
    );
  });
});

describe('createOrderSchema fund(카드/계좌는 세부 컬럼으로 구분)', () => {
  it('온라인 + cardCompany 또는 bankCode 중 하나면 허용', () => {
    expect(createOrderSchema.safeParse(fund()).success).toBe(true);
    expect(createOrderSchema.safeParse(fund({ cardCompany: null, bankCode: 1 })).success).toBe(true);
  });

  it('둘 다 없으면 INVALID_CARD_COMPANY, 둘 다 있으면 INVALID_PAYMENT_DETAIL_COMBINATION', () => {
    expect(messages(fund({ cardCompany: null }))).toContain('INVALID_CARD_COMPANY');
    expect(messages(fund({ bankCode: 0 }))).toContain('INVALID_PAYMENT_DETAIL_COMBINATION');
  });

  it('간편결제 세부는 거부', () => {
    expect(messages(fund({ easyPayProvider: 0 }))).toContain('INVALID_PAYMENT_DETAIL_COMBINATION');
  });
});
