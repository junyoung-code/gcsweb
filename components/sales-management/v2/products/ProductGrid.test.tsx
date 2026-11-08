import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SalesProduct } from '@/types/sales-management';
import ProductGrid from './ProductGrid';

afterEach(cleanup);
const product: SalesProduct = { id: 'qa', storeId: 'qa', name: '', category: '', price: 0, stock: 0, options: [], isVisible: true, hasSalesHistory: false };
describe('QA 상품 카드 말줄임', () => {
  it.each([20, 21])('%i자 상품명은 21자부터 줄이고 원문을 보존한다', length => {
    const name = '가'.repeat(length);
    render(<ProductGrid products={[{ ...product, name }]} onDelete={() => {}} />);
    expect(screen.getByRole('heading')).toHaveTextContent(length > 20 ? `${'가'.repeat(20)}…` : name);
    expect(screen.getByRole('heading')).toHaveAttribute('title', name);
  });
  it('21자 옵션 목록부터 줄이고 원문을 보존한다', () => {
    const name = '가'.repeat(18);
    render(<ProductGrid products={[{ ...product, options: [{ id: 'option', name, price: 0, stock: 0 }] }]} onDelete={() => {}} />);
    expect(screen.getByTitle(`${name}(0)`)).toHaveTextContent(`${name}(0…`);
  });
});
