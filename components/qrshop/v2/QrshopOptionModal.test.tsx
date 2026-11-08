import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QrshopOptionModal from './QrshopOptionModal';

const products = [
  { id: 's', categoryId: 'shirt', categoryName: '의류', name: '티셔츠', option: 'S', price: 10_000 },
  { id: 'l', categoryId: 'shirt', categoryName: '의류', name: '티셔츠', option: 'L', price: 11_000 },
  { id: 'xl', categoryId: 'shirt', categoryName: '의류', name: '티셔츠', option: 'XL', price: 12_000, soldOut: true },
];

afterEach(cleanup);

describe('QrshopOptionModal', () => {
  it('열릴 때 내부로 이동하고 Tab 순환과 Escape/완료 후 호출 버튼 복귀를 제공한다', () => {
    function Preview() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>옵션 열기</button><button>배경 상품</button>
        {open && <QrshopOptionModal products={products} selectedIds={[]} onClose={() => setOpen(false)} onConfirm={() => setOpen(false)} />}</>;
    }
    render(<Preview />);
    const trigger = screen.getByRole('button', { name: '옵션 열기' });
    trigger.focus();
    fireEvent.click(trigger);
    const first = screen.getByRole('button', { name: 'S' });
    const lastOption = screen.getByRole('button', { name: /L.*1,000원/ });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(lastOption).toHaveFocus();
    fireEvent.keyDown(lastOption, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.click(first);
    const confirm = screen.getByRole('button', { name: '완료' });
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'S' }));
    fireEvent.click(screen.getByRole('button', { name: '완료' }));
    expect(trigger).toHaveFocus();
  });

  it('선택할 수 있는 옵션이 없으면 모달 자체에 포커스를 유지하고 닫을 때 복귀한다', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<QrshopOptionModal products={products.map(product => ({ ...product, soldOut: true }))} selectedIds={[]} onClose={() => undefined} onConfirm={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(dialog).toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('복수 옵션, 추가 금액, 품절 상태를 표시하고 선택을 확정한다', () => {
    const onConfirm = vi.fn();
    render(<QrshopOptionModal products={products} selectedIds={[]} onClose={() => undefined} onConfirm={onConfirm} />);

    expect(screen.getByText('+ 1,000원')).toBeInTheDocument();
    expect(screen.getByText('품절')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /XL/ })).toBeDisabled();
    const small = screen.getByRole('button', { name: 'S' });
    expect(small).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(small);
    expect(small).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(small);
    expect(small).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(small);
    fireEvent.click(screen.getByRole('button', { name: /L.*1,000원/ }));
    fireEvent.click(screen.getByRole('button', { name: '완료' }));
    expect(onConfirm).toHaveBeenCalledWith(['s', 'l']);
  });

  it('이미 선택된 옵션이 품절되면 완료해도 담지 않는다', () => {
    const onConfirm = vi.fn();
    render(<QrshopOptionModal products={products} selectedIds={['xl']} onClose={() => undefined} onConfirm={onConfirm} />);
    expect(screen.getByRole('button', { name: '완료' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('모든 옵션이 품절이면 어떤 옵션도 선택하거나 담을 수 없다', () => {
    const onConfirm = vi.fn();
    render(<QrshopOptionModal products={products.map((product) => ({ ...product, soldOut: true }))} selectedIds={['s']} onClose={() => undefined} onConfirm={onConfirm} />);
    expect(screen.getByRole('button', { name: /^S.*품절$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^L.*품절$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '완료' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
