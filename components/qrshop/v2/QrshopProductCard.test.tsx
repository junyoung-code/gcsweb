import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QrshopProductCard from './QrshopProductCard';

const product = {
  id: 'keyring-black',
  categoryId: 'keyring',
  categoryName: '키링',
  name: '무슨무슨 키링',
  option: 'BLACK',
  price: 15_000,
  imageUrl: '/assets/qrshop/product-placeholder.png',
};

afterEach(cleanup);

describe('QrshopProductCard', () => {
  it('상품·옵션·가격을 보여주고 선택 이벤트를 전달한다', () => {
    const onSelect = vi.fn();
    render(<QrshopProductCard product={product} selected={false} onSelect={onSelect} />);

    expect(screen.getByText('무슨무슨 키링')).toBeInTheDocument();
    expect(screen.getByText('BLACK')).toBeInTheDocument();
    expect(screen.getByText('15,000원')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /무슨무슨 키링 BLACK 담기/ }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('선택된 상품은 장바구니 상태를 노출한다', () => {
    render(<QrshopProductCard product={product} selected onSelect={() => undefined} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: '장바구니에 담김' })).toHaveClass('bg-orange-5');
  });

  it('모든 옵션이 품절된 상품은 품절 상태를 표시하고 안내 모달을 열 수 있다', () => {
    const onSelect = vi.fn();
    const { container } = render(<QrshopProductCard product={product} selected={false} soldOut onSelect={onSelect} />);

    expect(screen.getByText('품절')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /무슨무슨 키링 BLACK 품절/ })).toBeEnabled();
    expect(container.querySelector('img[src*="product-placeholder"]')).toHaveClass('opacity-40');
    expect(container.querySelector('img[src*="sold-out-badge"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('이미지가 없는 상품은 Figma의 주황색 배경만 표시한다', () => {
    const { container } = render(
      <QrshopProductCard
        product={{ ...product, id: 'no-image', imageUrl: undefined }}
        selected={false}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByRole('button').firstElementChild).toHaveClass('bg-orange-2');
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });
});
