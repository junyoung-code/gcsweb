/** 엽서 묶음: 2개당 3,000원, 홀수 개는 남는 1개는 2,000원 */

/** item.json 기준(레거시) 엽서 품목의 name 값. category 정보가 없는 호출부의 폴백으로만 쓴다. */
export const POSTCARD_ITEM_NAME = '엽서';

/** OnsiteProductCategory 기준(신규) 엽서 카테고리명. DB 마이그레이션 데이터와 일치. */
export const POSTCARD_CATEGORY_NAME = '엽서';

/**
 * category 정보가 있으면 그걸로 판별한다(신규 DB 카탈로그: 상품명이 "엽서 A. 연꽃주황" 등으로
 * 갈라져 있어 name 은 더 이상 '엽서'와 정확히 같지 않음). category 정보가 없는 호출부
 * (lib/qrshop/catalog.ts, item.json 기반)는 기존처럼 name 으로 판별한다.
 */
export function isPostcardCatalogItem(item: { name: string; categoryName?: string }): boolean {
  if (item.categoryName !== undefined) return item.categoryName === POSTCARD_CATEGORY_NAME;
  return item.name === POSTCARD_ITEM_NAME;
}

export function postcardBundleSubtotal(totalQty: number): number {
  const q = Math.max(0, Math.floor(Number(totalQty)));
  const pairs = Math.floor(q / 2);
  const rem = q % 2;
  return pairs * 3000 + rem * 2000;
}

export function computePostcardBundleDiscount(
  totalQty: number,
  catalogUnitPerItem: number,
): { bundleSubtotal: number; naiveSubtotal: number; discount: number } {
  const q = Math.max(0, Math.floor(Number(totalQty)));
  const naive = q * catalogUnitPerItem;
  const bundle = postcardBundleSubtotal(q);
  return { bundleSubtotal: bundle, naiveSubtotal: naive, discount: naive - bundle };
}

/**
 * 묶음 할인액(D)을 라인별 lineDiscountWon으로 나눈다. sum(lineDiscountWon) === D.
 * 주문 행 단가는 catalogUnit(정가)로 두고, 결제는 unit*qty - lineDiscount로 맞춘다.
 */
export function allocatePostcardLineDiscounts(
  lines: ReadonlyArray<{ itemId: string; quantity: number }>,
  catalogUnit: number,
): Map<string, number> {
  const map = new Map<string, number>();
  if (lines.length === 0) return map;

  const Q = lines.reduce((s, l) => s + l.quantity, 0);
  const B = postcardBundleSubtotal(Q);
  const N = catalogUnit * Q;
  const D = N - B;

  if (D === 0) {
    for (const l of lines) map.set(l.itemId, 0);
    return map;
  }

  const weights = lines.map((l) => catalogUnit * l.quantity);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const discounts = lines.map((_, i) => Math.floor((D * weights[i]) / totalWeight));

  let sumDisc = discounts.reduce((a, b) => a + b, 0);
  let rem = D - sumDisc;

  const idealFrac = lines.map((_, i) => {
    const ideal = (D * weights[i]) / totalWeight;
    return ideal - Math.floor(ideal);
  });
  const orderIdx = lines
    .map((_, i) => i)
    .sort((a, b) => idealFrac[b] - idealFrac[a] || lines[b].quantity - lines[a].quantity);

  let guard = 0;
  while (rem > 0 && guard < D + lines.length * 8) {
    let progressed = false;
    for (const i of orderIdx) {
      if (rem <= 0) break;
      if (discounts[i] < weights[i]) {
        discounts[i]++;
        rem--;
        progressed = true;
      }
    }
    if (!progressed) break;
    guard++;
  }

  if (rem !== 0) {
    throw new Error('postcard line discount allocation failed');
  }

  for (let i = 0; i < lines.length; i++) {
    map.set(lines[i].itemId, discounts[i]!);
  }
  return map;
}

export type QrShopCartLine = { name: string; price: number; qty: number };

export function computeQrShopCartTotal(lines: QrShopCartLine[]): {
  total: number;
  postcardDiscount: number;
} {
  let nonPc = 0;
  let pcQty = 0;
  let pcUnit = 2000;

  for (const row of lines) {
    if (isPostcardCatalogItem({ name: row.name })) {
      pcQty += row.qty;
      pcUnit = row.price;
    } else {
      nonPc += row.price * row.qty;
    }
  }

  const { bundleSubtotal, discount } = computePostcardBundleDiscount(pcQty, pcUnit);
  return { total: nonPc + bundleSubtotal, postcardDiscount: discount };
}
