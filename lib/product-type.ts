/**
 * 상품 유형(Product.type) 상수.
 *
 * DB에는 Int로 저장되며 Prisma enum이 아니므로, 숫자의 의미는 여기서만 정의한다.
 */
export const PRODUCT_TYPE = {
  FUND: 0,
  BUY_NOW: 1,
  PARTNER_UP: 2,
} as const;

export type ProductTypeValue = (typeof PRODUCT_TYPE)[keyof typeof PRODUCT_TYPE];

/** DB에 존재할 수 있는 모든 유형. 조회/표시에 사용한다. */
export const ALL_PRODUCT_TYPES: ProductTypeValue[] = [
  PRODUCT_TYPE.FUND,
  PRODUCT_TYPE.BUY_NOW,
  PRODUCT_TYPE.PARTNER_UP,
];

/**
 * 신규 등록·수정 시 선택 가능한 유형.
 *
 * Fund와 Partner Up은 2026-09-09 백엔드 회의 결정으로 비활성화되었다.
 * 기존에 등록된 상품은 그대로 두므로, 조회 경로에서는 ALL_PRODUCT_TYPES를 써야 한다.
 */
export const SELECTABLE_PRODUCT_TYPES: ProductTypeValue[] = [PRODUCT_TYPE.BUY_NOW];

/** 등록·수정 입력값으로 허용되는 유형인지 검사한다. */
export function isSelectableProductType(value: unknown): value is ProductTypeValue {
  return (
    typeof value === 'number' &&
    SELECTABLE_PRODUCT_TYPES.includes(value as ProductTypeValue)
  );
}

/** 해당 유형이 현재 비활성(선택 불가) 상태인지. 화면에서 disabled 처리에 사용한다. */
export function isDisabledProductType(value: ProductTypeValue): boolean {
  return !SELECTABLE_PRODUCT_TYPES.includes(value);
}

/** 유형 선택 UI에 노출하는 항목. 비활성 유형도 disabled 상태로 함께 보여준다. */
export const PRODUCT_TYPE_OPTIONS: Array<{ value: ProductTypeValue; label: string }> = [
  { value: PRODUCT_TYPE.FUND, label: 'Fund' },
  { value: PRODUCT_TYPE.BUY_NOW, label: 'Buy Now' },
  { value: PRODUCT_TYPE.PARTNER_UP, label: 'Partner Up' },
];
