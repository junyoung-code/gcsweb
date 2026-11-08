import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SellerSummary } from '@/types/sales-management';
import SalesManagementLanding from './SalesManagementLanding';

const registeredSummary: SellerSummary = {
  store: {
    hasSalesHistory: true,
    id: 'store-1',
    name: '잇장샵',
    storeIdentifier: 'itjang-shop',
    visitorOrderUrl: '/QRshop?store=itjang-shop',
    description: '상점 한 줄 소개',
  },
  productCount: 0,
  orderCount: 3,
  lowStockCount: 1,
};

describe('SalesManagementLanding', () => {
  it('등록 상점 정보와 상품 관리 링크를 표시한다', () => {
    render(<SalesManagementLanding status="ready" summary={registeredSummary} />);

    expect(screen.getByRole('heading', { name: '잇장샵' })).toBeInTheDocument();
    expect(screen.getByText('상점 한 줄 소개')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '내 상품 등록하러가기' }),
    ).toHaveAttribute('href', '/sales-management/products');
  });

  it('상점이 없으면 Figma의 두 빈 상태와 선행 안내를 표시한다', () => {
    render(
      <SalesManagementLanding
        status="ready"
        summary={{
          store: null,
          productCount: 0,
          orderCount: 0,
          lowStockCount: 0,
        }}
      />,
    );

    expect(screen.getByText('아직 상점이 등록되지 않았어요!')).toBeInTheDocument();
    expect(screen.getByText('아직 상품이 등록되지 않았어요!')).toBeInTheDocument();
    expect(screen.getByText('상점 등록 후 상품을 등록해주세요.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '내 상점 등록하러가기' }),
    ).toHaveAttribute('href', '/sales-management/store');
  });

  it('로딩 상태를 보조 기술에 알린다', () => {
    render(<SalesManagementLanding status="loading" />);

    expect(
      screen.getByRole('status', { name: '판매 관리 정보를 불러오는 중' }),
    ).toBeInTheDocument();
    expect(screen.getByText('로딩 중')).toBeInTheDocument();
  });

  it('오류 메시지와 다시 불러오기 링크를 표시한다', () => {
    render(
      <SalesManagementLanding
        status="error"
        errorMessage="판매 관리 정보를 불러오지 못했습니다."
      />,
    );

    expect(
      screen.getByRole('heading', { name: '판매 관리 정보를 불러오지 못했어요.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('판매 관리 정보를 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다시 불러오기' })).toHaveAttribute(
      'href',
      '/sales-management',
    );
  });
});
