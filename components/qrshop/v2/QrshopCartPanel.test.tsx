import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QrshopCartPanel from './QrshopCartPanel';

const line = {
  productId: 'keyring-black',
  productName: '무슨무슨 키링',
  option: 'BLACK',
  quantity: 1,
  unitPrice: 15_000,
};

afterEach(cleanup);

function renderPanel(overrides: Partial<React.ComponentProps<typeof QrshopCartPanel>> = {}) {
  const props: React.ComponentProps<typeof QrshopCartPanel> = {
    lines: [line],
    agreed: true,
    submitting: false,
    error: null,
    onAgreementChange: vi.fn(),
    onQuantityChange: vi.fn(),
    onRemove: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  render(<QrshopCartPanel {...props} />);
  return props;
}

describe('QrshopCartPanel', () => {
  it('선택 상품 합계와 Figma 결제 항목만 표시하고 제출한다', () => {
    const props = renderPanel();
    expect(screen.getAllByText('15,000원')).toHaveLength(2);
    expect(screen.queryByLabelText('주문자 이름')).not.toBeInTheDocument();
    expect(screen.queryByText('온라인 결제')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '쇼핑몰 이용약관 보기' })).toHaveAttribute('href', '/terms/terms-of-service');

    fireEvent.click(screen.getByRole('button', { name: '결제하기' }));
    expect(props.onSubmit).toHaveBeenCalledOnce();
  });

  it('빈 장바구니에서는 결제 버튼을 비활성화한다', () => {
    renderPanel({ lines: [], agreed: false });
    expect(screen.getByRole('button', { name: '결제하기' })).toBeDisabled();
    expect(screen.getByText('0원')).toBeInTheDocument();
  });

  it('수량 변경과 삭제 이벤트를 전달한다', () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '무슨무슨 키링 수량 증가' }));
    fireEvent.click(screen.getByRole('button', { name: '무슨무슨 키링 삭제' }));
    expect(props.onQuantityChange).toHaveBeenCalledWith('keyring-black', 2);
    expect(props.onRemove).toHaveBeenCalledWith('keyring-black');
  });

  it('선택 상품이 6개 이상이면 상품 목록만 제한 높이로 스크롤한다', () => {
    const lines = Array.from({ length: 6 }, (_, index) => ({
      ...line,
      productId: `product-${index + 1}`,
      productName: `상품 ${index + 1}`,
    }));
    renderPanel({ lines });

    const list = screen.getByRole('list', { name: '선택 상품 목록' });
    expect(list).toHaveClass('max-h-[512px]', 'overflow-y-auto');
    expect(screen.getByText('결제 금액').closest('div')?.parentElement).not.toBe(list);
    expect(screen.getByRole('button', { name: '결제하기' })).toBeVisible();
  });

  it('핸들을 아래로 충분히 끌면 주문 정보를 접는다', () => {
    renderPanel();
    const panel = screen.getByRole('region', { name: '주문 정보' });
    const handle = screen.getByRole('button', { name: '주문 정보 접기' });
    Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 500 });

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 100 });

    expect(screen.getByRole('button', { name: '주문 정보 펼치기' })).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveStyle({ transform: 'translateY(calc(100% - 26px))' });
  });

  it('짧은 아래 드래그는 주문 정보를 원위치시킨다', () => {
    renderPanel();
    const panel = screen.getByRole('region', { name: '주문 정보' });
    const handle = screen.getByRole('button', { name: '주문 정보 접기' });
    Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 500 });

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 40 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 40 });

    expect(handle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveStyle({ transform: 'translateY(0)' });
  });
});
