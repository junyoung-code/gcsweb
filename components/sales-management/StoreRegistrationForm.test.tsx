import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SalesManagementService } from '@/lib/services/sales-management-service';
import StoreRegistrationForm from './StoreRegistrationForm';

function createService(overrides: Partial<SalesManagementService> = {}): SalesManagementService {
  return {
    getStore: async () => null,
    checkStoreIdentifier: async () => true,
    saveStore: async (input) => ({
      hasSalesHistory: false,
      id: 'store-paper-shop',
      ...input,
      visitorOrderUrl: '/QRshop?store=paper-shop',
    }),
    getProducts: async () => ({ items: [], total: 0 }),
    saveProduct: async (product) => ({
      ...product,
      id: 'product-1',
      isVisible: true,
      hasSalesHistory: false,
      options: product.options.map((option, index) => ({
        ...option,
        id: `option-${index + 1}`,
      })),
    }),
    getOrders: async () => ({ items: [], total: 0 }),
    getInventory: async () => ({ items: [], total: 0 }),
    ...overrides,
  };
}

afterEach(cleanup);

describe('StoreRegistrationForm', () => {
  it('필수값과 상점 아이디 중복 확인을 검증한다', () => {
    render(<StoreRegistrationForm service={createService()} />);

    fireEvent.click(screen.getByRole('button', { name: '상점 등록하기' }));

    expect(screen.getByText('상점명은 2자 이상 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByText('영문 소문자, 숫자, 하이픈으로 3~20자 입력해주세요.')).toBeInTheDocument();
  });

  it('아이디 확인 중 상태를 표시하고 사용 가능 여부를 안내한다', async () => {
    let resolveCheck: ((value: boolean) => void) | undefined;
    const service = createService({
      checkStoreIdentifier: () => new Promise<boolean>((resolve) => {
        resolveCheck = resolve;
      }),
    });
    render(<StoreRegistrationForm service={service} />);

    fireEvent.change(screen.getByLabelText('상점 아이디'), { target: { value: 'paper-shop' } });
    fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
    expect(screen.getByRole('button', { name: '확인 중' })).toBeDisabled();

    await act(async () => resolveCheck?.(true));
    expect(await screen.findByText('사용 가능한 아이디입니다.')).toBeInTheDocument();
  });

  it('아이디 확인 서비스 오류를 필드 오류로 표시한다', async () => {
    const service = createService({
      checkStoreIdentifier: async () => {
        throw new Error('아이디 확인 중 일시적인 오류가 발생했습니다.');
      },
    });
    render(<StoreRegistrationForm service={service} />);

    fireEvent.change(screen.getByLabelText('상점 아이디'), { target: { value: 'error-shop' } });
    fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));

    expect(
      await screen.findByText('아이디 확인 중 일시적인 오류가 발생했습니다.'),
    ).toBeInTheDocument();
  });

  it('확인된 유효 입력을 제출하면 URL과 QR 결과 화면을 표시한다', async () => {
    render(<StoreRegistrationForm service={createService()} />);

    fireEvent.change(screen.getByLabelText('상점명'), { target: { value: '종이 상점' } });
    fireEvent.change(screen.getByLabelText('상점 아이디'), { target: { value: 'paper-shop' } });
    fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
    await screen.findByText('사용 가능한 아이디입니다.');
    fireEvent.click(screen.getByRole('button', { name: '상점 등록하기' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'QR샵 URL' })).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('/QRshop?store=paper-shop')).toBeInTheDocument();
    expect(screen.getByLabelText('방문객 주문 QR 코드 미리보기')).toBeInTheDocument();
  });
});
