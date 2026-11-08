import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SalesManagementPageShell from './SalesManagementPageShell';

describe('SalesManagementPageShell', () => {
  it('제목, 탭, 페이지 내용을 표시한다', () => {
    render(
      <SalesManagementPageShell
        title="상품 관리"
        activeTabHref="/sales-management/products"
        tabs={[
          { href: '/sales-management/products', label: '상품' },
          { href: '/sales-management/inventory', label: '재고' },
        ]}
      >
        <p>상품 목록</p>
      </SalesManagementPageShell>,
    );

    expect(screen.getByRole('heading', { name: '상품 관리' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상품' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('상품 목록')).toBeInTheDocument();
  });
});
