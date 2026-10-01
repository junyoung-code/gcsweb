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

  it('결제 요약은 고정하고 선택 상품 목록만 스크롤한다', () => {
    renderPanel();
    const panel = screen.getByRole('region', { name: '주문 정보' });
    const list = screen.getByRole('list', { name: '선택 상품 목록' });
    const summary = screen.getByText('결제 금액').closest('div')?.parentElement;

    expect(panel).toHaveClass('fixed', 'bottom-0');
    expect(list).toHaveClass('max-h-[512px]', 'overflow-y-auto');
    expect(summary).toHaveClass('shrink-0', 'bg-white');
  });

  it('상단 핸들은 상품 목록만 접고 결제 요약은 유지한다', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '주문 정보 접기' }));

    expect(screen.getByRole('button', { name: '주문 정보 펼치기' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '주문 정보 펼치기' }).parentElement).toHaveStyle({ height: '26px' });
    expect(screen.getByRole('button', { name: '결제하기' })).toBeVisible();
  });

  it('접힌 핸들을 위로 끌어 놓으면 상품 목록을 다시 펼친다', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '주문 정보 접기' }));
    const handle = screen.getByRole('button', { name: '주문 정보 펼치기' });
    const listPanel = handle.parentElement!;
    Object.defineProperty(listPanel, 'offsetHeight', { configurable: true, value: 26 });
    Object.defineProperty(listPanel, 'scrollHeight', { configurable: true, value: 320 });

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 100 });

    expect(screen.getByRole('button', { name: '주문 정보 접기' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '주문 정보 접기' }).parentElement).not.toHaveStyle({ height: '26px' });
  });

  it('펼친 핸들을 아래로 끌면 상품 목록을 접는다', () => {
    renderPanel();
    const handle = screen.getByRole('button', { name: '주문 정보 접기' });
    const listPanel = handle.parentElement!;
    Object.defineProperty(listPanel, 'offsetHeight', { configurable: true, value: 320 });
    Object.defineProperty(listPanel, 'scrollHeight', { configurable: true, value: 320 });

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 200 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 200 });

    expect(screen.getByRole('button', { name: '주문 정보 펼치기' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '결제하기' })).toBeVisible();
  });
});
