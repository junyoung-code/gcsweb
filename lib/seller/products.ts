import type { Prisma } from '@prisma/client';

/**
 * 「전체 상품」 화면의 카테고리 드롭다운 + 검색창을 쿼리스트링으로 받는다.
 *
 * 둘 다 선택이고, 디자인상 동시에 걸린다(카테고리 "숄더백" + 검색어 "가방" → 둘 다 만족).
 * 드롭다운 기본값 "전체"는 필터를 걸지 않는 상태이므로 빈 값으로 온다.
 */
export type ProductListFilter = {
  q: string | null;
  categoryId: string | null;
};

export function parseProductListFilter(searchParams: URLSearchParams): ProductListFilter {
  const q = (searchParams.get('q') ?? '').trim();
  const categoryId = (searchParams.get('categoryId') ?? '').trim();

  return {
    q: q === '' ? null : q,
    // "전체"를 all 로 보내는 프론트도 받아준다.
    categoryId: categoryId === '' || categoryId === 'all' ? null : categoryId,
  };
}

/**
 * 내 상점 상품만 보되, 검색어·카테고리가 있으면 AND 로 좁힌다.
 *
 * 검색은 상품명 부분 일치다(디자인: "가방" → "무슨무슨가방"). 한글은 대소문자가
 * 없지만 영문 상품명을 위해 insensitive 로 둔다.
 */
export function buildProductListWhere(
  storeId: string,
  filter: ProductListFilter,
): Prisma.OnsiteProductWhereInput {
  return {
    storeId,
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.q ? { name: { contains: filter.q, mode: 'insensitive' as const } } : {}),
  };
}
