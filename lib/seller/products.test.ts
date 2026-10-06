import { describe, expect, it } from 'vitest';
import {
  buildProductListWhere,
  MAX_PAGE_SIZE,
  parsePagination,
  parseProductListFilter,
} from './products';

const params = (qs: string) => new URLSearchParams(qs);

describe('parseProductListFilter', () => {
  it('아무것도 없으면 둘 다 null 이다', () => {
    expect(parseProductListFilter(params(''))).toEqual({ q: null, categoryId: null });
  });

  it('검색어와 카테고리를 함께 읽는다', () => {
    expect(parseProductListFilter(params('q=가방&categoryId=cat-1'))).toEqual({
      q: '가방',
      categoryId: 'cat-1',
    });
  });

  it('공백만 있는 값은 필터로 치지 않는다', () => {
    expect(parseProductListFilter(params('q=%20%20&categoryId=%20'))).toEqual({
      q: null,
      categoryId: null,
    });
  });

  it('카테고리 "전체"를 뜻하는 all 은 필터를 걸지 않는다', () => {
    expect(parseProductListFilter(params('categoryId=all')).categoryId).toBeNull();
  });

  it('검색어 앞뒤 공백은 떼고 쓴다', () => {
    expect(parseProductListFilter(params('q=%20가방%20')).q).toBe('가방');
  });
});

describe('buildProductListWhere', () => {
  it('필터가 없으면 내 상점 조건만 건다', () => {
    expect(buildProductListWhere('store-1', { q: null, categoryId: null })).toEqual({
      storeId: 'store-1',
    });
  });

  it('검색어는 상품명 부분 일치로 건다', () => {
    expect(buildProductListWhere('store-1', { q: '가방', categoryId: null })).toEqual({
      storeId: 'store-1',
      name: { contains: '가방', mode: 'insensitive' },
    });
  });

  it('카테고리와 검색어가 같이 오면 둘 다 건다', () => {
    expect(buildProductListWhere('store-1', { q: '가방', categoryId: 'cat-1' })).toEqual({
      storeId: 'store-1',
      categoryId: 'cat-1',
      name: { contains: '가방', mode: 'insensitive' },
    });
  });

  it('남의 상점 상품이 섞이지 않도록 storeId 는 항상 남는다', () => {
    const where = buildProductListWhere('store-1', { q: '가방', categoryId: 'cat-1' });
    expect(where.storeId).toBe('store-1');
  });
});

describe('parsePagination', () => {
  it('아무것도 없으면 1페이지, 20개다', () => {
    expect(parsePagination(params(''))).toEqual({ page: 1, pageSize: 20 });
  });

  it('page 와 pageSize 를 읽는다', () => {
    expect(parsePagination(params('page=3&pageSize=10'))).toEqual({ page: 3, pageSize: 10 });
  });

  it('0·음수·소수·숫자가 아닌 값은 기본값으로 대체한다', () => {
    expect(parsePagination(params('page=0&pageSize=-5'))).toEqual({ page: 1, pageSize: 20 });
    expect(parsePagination(params('page=1.5&pageSize=abc'))).toEqual({ page: 1, pageSize: 20 });
  });

  it('pageSize 는 상한을 넘기지 못한다', () => {
    expect(parsePagination(params('pageSize=100000')).pageSize).toBe(MAX_PAGE_SIZE);
  });
});
