import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SalesManagementPage from './page';

describe('SalesManagementPage', () => {
  it('판매관리 각 기능으로 이동하는 메뉴 링크를 제공한다', async () => {
    render(await SalesManagementPage({}));

    expect(screen.getByRole('link', { name: '판매 홈' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: '상점' })).toHaveAttribute(
      'href',
      '/sales-management/store',
    );
    expect(screen.getByRole('link', { name: '상품' })).toHaveAttribute(
      'href',
      '/sales-management/products',
    );
    expect(screen.getByRole('link', { name: '주문' })).toHaveAttribute(
      'href',
      '/sales-management/orders',
    );
    expect(screen.getByRole('link', { name: '재고' })).toHaveAttribute(
      'href',
      '/sales-management/inventory',
    );
  });

  it('Mock 빈 상태를 화면 상태로 변환한다', async () => {
    render(await SalesManagementPage({ searchParams: { state: 'empty' } }));

    expect(screen.getByText('아직 상점이 등록되지 않았어요!')).toBeInTheDocument();
  });

  it('Mock 오류를 오류 화면 상태로 변환한다', async () => {
    render(await SalesManagementPage({ searchParams: { state: 'error' } }));

    expect(
      screen.getByRole('heading', { name: '판매 관리 정보를 불러오지 못했어요.' }),
    ).toBeInTheDocument();
  });
});
