import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQrshopMockOrders, qrshopMockService } from '@/lib/mocks/qrshop-service';
import QrshopOrderClient from './QrshopOrderClient';
import QrshopPayClient from './QrshopPayClient';
import QrshopResultClient from './QrshopResultClient';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), query: '' }));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

beforeEach(() => {
  vi.clearAllMocks();
  navigation.query = '';
  clearQrshopMockOrders();
});
afterEach(cleanup);

async function createOrderThroughScreen() {
  const view = render(<QrshopOrderClient />);
  fireEvent.click(await screen.findByRole('button', { name: '무슨무슨 키링 BLACK 담기' }));
  fireEvent.click(screen.getByRole('button', { name: 'BLACK' }));
  fireEvent.click(screen.getByRole('button', { name: '완료' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '결제하기' }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(expect.stringMatching(/^\/QRshop\/v2\/pay\?orderId=.+/)));
  const payUrl = new URL(navigation.push.mock.lastCall![0], 'https://example.test');
  navigation.query = payUrl.search;
  view.unmount();
  return payUrl;
}

describe('QRshop v2 화면 연결', () => {
  it('상품 클릭 시 옵션을 복수 선택해 결제 목록에 반영한다', async () => {
    render(<QrshopOrderClient />);
    fireEvent.click(await screen.findByRole('button', { name: '무슨무슨 키링 BLACK 담기' }));
    expect(screen.getByText('옵션은 복수선택 가능합니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'BLACK' }));
    fireEvent.click(screen.getByRole('button', { name: 'ORANGE' }));
    fireEvent.click(screen.getByRole('button', { name: '완료' }));
    expect(screen.getAllByText('BLACK')).toHaveLength(2);
    expect(screen.getAllByText('ORANGE')).toHaveLength(2);
  });

  it('상품 주문부터 결제 완료와 처음으로 이동까지 v2 주소를 유지한다', async () => {
    const payUrl = await createOrderThroughScreen();
    const pay = render(<QrshopPayClient />);
    fireEvent.click(await screen.findByRole('button', { name: '결제 완료하기' }));
    await waitFor(() => expect(navigation.push).toHaveBeenLastCalledWith(`/QRshop/v2/result${payUrl.search}`));
    pay.unmount();

    render(<QrshopResultClient />);
    expect(await screen.findByRole('heading', { name: '결제가 완료되었습니다' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '처음으로' }));
    expect(navigation.push).toHaveBeenLastCalledWith('/QRshop/v2');
  });

  it('실패한 결제의 재시도도 같은 v2 주문으로 연결한다', async () => {
    const payUrl = await createOrderThroughScreen();
    const pay = render(<QrshopPayClient />);
    fireEvent.click(await screen.findByRole('button', { name: '결제 실패 상태 확인' }));
    await waitFor(() => expect(navigation.push).toHaveBeenLastCalledWith(`/QRshop/v2/result${payUrl.search}`));
    pay.unmount();

    render(<QrshopResultClient />);
    fireEvent.click(await screen.findByRole('button', { name: '결제 다시 시도' }));
    expect(navigation.push).toHaveBeenLastCalledWith(`${payUrl.pathname}${payUrl.search}`);
  });

  it('완료 주문이 4개 이상이면 상품 목록만 스크롤하고 결제 요약은 고정한다', async () => {
    const order = await qrshopMockService.createOrder({
      buyerName: '현장 주문',
      buyerPhone: '',
      paymentMethod: 'on-site',
      lines: Array.from({ length: 4 }, (_, index) => ({
        productId: `product-${index + 1}`,
        productName: `상품 ${index + 1}`,
        option: 'BLACK',
        quantity: 1,
        unitPrice: 10_000,
      })),
    });
    await qrshopMockService.processPayment(order.orderId, 'success');
    navigation.query = `?orderId=${order.orderId}`;

    render(<QrshopResultClient />);

    const list = await screen.findByRole('list', { name: '완료 주문 상품 목록' });
    expect(list).toHaveClass('max-h-[343px]', 'overflow-y-auto');
    expect(screen.getByRole('group', { name: '결제 결과 요약' })).toHaveClass('shrink-0');
    expect(screen.getByRole('main')).toHaveClass('h-dvh', 'overflow-hidden');
  });
});
