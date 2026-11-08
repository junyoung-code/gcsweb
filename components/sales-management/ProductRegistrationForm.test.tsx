import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createSalesManagementMockService } from '@/lib/mocks';
import ProductRegistrationForm from './ProductRegistrationForm';

describe('ProductRegistrationForm', () => {
  afterEach(cleanup);
  it('필수값이 비어 있으면 검증 오류를 표시한다', async () => {
    render(<ProductRegistrationForm service={createSalesManagementMockService()} />);
    await screen.findByRole('button', { name: '상품 등록하기' });
    fireEvent.click(screen.getByRole('button', { name: '상품 등록하기' }));
    expect(await screen.findByText('상품명을 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByText('카테고리를 입력해주세요.')).toBeInTheDocument();
  });

  it('기본 가격과 재고를 가진 상품을 등록하고 결과에 표시한다', async () => {
    render(<ProductRegistrationForm service={createSalesManagementMockService()} />);
    await screen.findByRole('button', { name: '상품 등록하기' });
    fireEvent.change(screen.getByPlaceholderText('상품명을 입력하세요'), { target: { value: '손목시계' } });
    fireEvent.change(screen.getByPlaceholderText('예: 시계'), { target: { value: '시계' } });
    fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '30000' } });
    fireEvent.change(screen.getAllByPlaceholderText('0')[1], { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: '상품 등록하기' }));
    expect(await screen.findByRole('status')).toHaveTextContent('손목시계');
    expect(screen.getByText(/시계 · 30,000원 · 재고 20개/)).toBeInTheDocument();
  });

  it('옵션을 켜면 옵션별 가격과 재고 입력을 사용한다', async () => {
    render(<ProductRegistrationForm service={createSalesManagementMockService()} />);
    await screen.findByRole('button', { name: '상품 등록하기' });
    fireEvent.click(screen.getByLabelText('사용함'));
    expect(screen.getByLabelText('옵션 추가')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('옵션 추가'));
    await waitFor(() => expect(screen.getAllByLabelText(/옵션 \d+ 삭제/)).toHaveLength(2));
  });
});
