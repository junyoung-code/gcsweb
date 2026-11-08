import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { qrshopMockService } from '@/lib/mocks/qrshop-service';
import { PAYMENT_SESSION_MISSING } from '@/lib/qrshop/payment-session';
import QrshopStorePage from '@/app/QRshop/(v2)/[storeSlug]/page';
import QrshopOrderClient from './QrshopOrderClient';
import QrshopPayClient from './QrshopPayClient';
import QrshopResultClient from './QrshopResultClient';

const navigation = vi.hoisted(() => ({ push: vi.fn(), query: '' }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

const catalog = {
  store: { storeId: 's1', name: '실제 상점', storeSlug: 'shop1234' },
  categories: [{ categoryId: 'c1', name: '의류' }],
  products: [
    { productId: 'p1', name: '티셔츠', categoryId: 'c1', price: 5000, imageUrl: null, hasOption: true, soldOut: false, stock: null,
      options: [{ optionId: 'o1', name: 'S', surcharge: 1000, stock: 2, soldOut: false }, { optionId: 'o2', name: 'L', surcharge: 2000, stock: 1, soldOut: false }] },
    { productId: 'p2', name: '티셔츠', categoryId: 'c1', price: 5000, imageUrl: null, hasOption: false, soldOut: false, stock: 2, options: [] },
  ],
};
const response = (data: unknown = catalog) => ({ ok: true, json: async () => ({ status: 'success', data }) });
const chooseOptions = async () => {
  fireEvent.click(await screen.findByRole('button', { name: '티셔츠 S L 담기' }));
  fireEvent.click(screen.getByRole('button', { name: /^S/ }));
  fireEvent.click(screen.getByRole('button', { name: /^L/ }));
  fireEvent.click(screen.getByRole('button', { name: '완료' }));
};
const submit = () => {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '결제하기' }));
};

beforeEach(() => { sessionStorage.clear(); navigation.query = '?storeSlug=shop1234'; vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('QRshop 실제 카탈로그 경계', () => {
  it('라우터가 인코딩한 @ 접두사에서도 해당 상점 카탈로그를 조회한다', async () => {
    const fetcher = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetcher);
    render(<QrshopStorePage params={{ storeSlug: '%40shop1234' }} />);
    expect(await screen.findByRole('heading', { name: '실제 상점' })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith('/api/v2/qrshop?storeSlug=shop1234', { cache: 'no-store' });
  });

  it('공식 @slug 주소에서 상점명과 동명 상품을 분리하고 반복 담기·옵션별 수량의 재고 상한을 지킨다', async () => {
    navigation.query = '?scenario=closed'; // A real store URL takes precedence over QA scenarios.
    const fetcher = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetcher);
    render(<QrshopStorePage params={{ storeSlug: '@shop1234' }} />);
    expect(await screen.findByRole('heading', { name: '실제 상점' })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith('/api/v2/qrshop?storeSlug=shop1234', { cache: 'no-store' });
    const single = screen.getByRole('button', { name: '티셔츠 담기' });
    fireEvent.click(single); fireEvent.click(single); fireEvent.click(single);
    expect(screen.getByRole('alert')).toHaveTextContent('남은 재고수 이상으로 상품을 담을 수 없습니다.');
    let rows = within(screen.getByRole('list', { name: '선택 상품 목록' })).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('2')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: '티셔츠 수량 증가' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '티셔츠 S L 담기' }));
    expect(screen.getByRole('button', { name: /^S/ })).toHaveTextContent('+ 1,000원');
    expect(screen.getByRole('button', { name: /^L/ })).toHaveTextContent('+ 2,000원');
    fireEvent.click(screen.getByRole('button', { name: /^S/ }));
    fireEvent.click(screen.getByRole('button', { name: /^L/ }));
    fireEvent.click(screen.getByRole('button', { name: '완료' }));
    rows = within(screen.getByRole('list', { name: '선택 상품 목록' })).getAllByRole('listitem');
    const small = rows.find(row => row.textContent?.includes('S · 재고'))!;
    const large = rows.find(row => row.textContent?.includes('L · 재고'))!;
    fireEvent.click(within(small).getByRole('button', { name: '티셔츠 수량 증가' }));
    expect(within(small).getByText('2')).toBeInTheDocument();
    expect(within(small).getByRole('button', { name: '티셔츠 수량 증가' })).toBeDisabled();
    expect(within(large).getByText('1')).toBeInTheDocument();
    expect(within(large).getByRole('button', { name: '티셔츠 수량 증가' })).toBeDisabled();
  });

  it('재조회 후 품절 옵션을 제거하면서 다른 옵션의 재고 감소·새 가격도 반영한다', async () => {
    const changed = { ...catalog, products: [{ ...catalog.products[0], price: 6000, options: [
      { ...catalog.products[0].options[0], stock: 1 },
      { ...catalog.products[0].options[1], stock: 0, soldOut: true },
    ] }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response(changed)));
    const createOrder = vi.spyOn(qrshopMockService, 'createOrder');
    render(<QrshopOrderClient />);
    await chooseOptions();
    const rows = within(screen.getByRole('list', { name: '선택 상품 목록' })).getAllByRole('listitem');
    fireEvent.click(within(rows[0]).getByRole('button', { name: '티셔츠 수량 증가' }));
    submit();
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('티셔츠가 품절되었습니다.');
    const cart = within(screen.getByRole('list', { name: '선택 상품 목록' }));
    expect(cart.getAllByRole('listitem')).toHaveLength(1);
    expect(cart.getByText('1')).toBeInTheDocument();
    expect(cart.getByText('7,000원')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('재고가 변경되어');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(createOrder).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('API 실패 후 재시도하고 실제 주문을 만들어 상점 식별을 유지한다', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ status: 'error', message: '서버 오류' }) })
      .mockResolvedValueOnce(response()).mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ orderId: 'api-order', orderNo: '100', paymentAmount: 5100, guestToken: 'private-token', payment: { storeId: 'ps1', channelKey: 'ch1', orderName: '티셔츠' } }));
    vi.stubGlobal('fetch', fetcher);
    const createOrder = vi.spyOn(qrshopMockService, 'createOrder');
    render(<QrshopOrderClient />);
    expect(await screen.findByRole('heading', { name: '상품을 불러올 수 없습니다' })).toBeInTheDocument();
    expect(screen.getByText('서버 오류')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '무슨무슨 키링 BLACK ORANGE 담기' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    fireEvent.click(await screen.findByRole('button', { name: '티셔츠 담기' }));
    submit();
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/QRshop/pay?orderId=api-order&storeSlug=shop1234'));
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(createOrder).not.toHaveBeenCalled();
    expect(navigation.push.mock.calls.flat().join('')).not.toContain('private-token');
  });

  it('재조회 실패 시 선택을 유지하고 Mock 주문을 만들지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('네트워크 오류')));
    const createOrder = vi.spyOn(qrshopMockService, 'createOrder');
    render(<QrshopOrderClient />);
    fireEvent.click(await screen.findByRole('button', { name: '티셔츠 담기' }));
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
    expect(within(screen.getByRole('list', { name: '선택 상품 목록' })).getByText('1')).toBeInTheDocument();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('상점 전환 전의 늦은 재조회 응답이 새 상점·장바구니를 덮어쓰지 않는다', async () => {
    let resolveRefresh!: (value: ReturnType<typeof response>) => void;
    const pending = new Promise<ReturnType<typeof response>>(resolve => { resolveRefresh = resolve; });
    const next = { ...catalog, store: { storeId: 's2', name: '다음 상점', storeSlug: 'next1234' } };
    const fetcher = vi.fn().mockResolvedValueOnce(response()).mockReturnValueOnce(pending).mockResolvedValueOnce(response(next));
    vi.stubGlobal('fetch', fetcher);
    const view = render(<QrshopOrderClient />);
    fireEvent.click(await screen.findByRole('button', { name: '티셔츠 담기' }));
    submit();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    navigation.query = '?storeSlug=next1234';
    view.rerender(<QrshopOrderClient />);
    await screen.findByRole('heading', { name: '다음 상점' });
    await act(async () => { resolveRefresh(response()); });
    expect(screen.getByRole('heading', { name: '다음 상점' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '선택 상품 목록' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each([QrshopPayClient, QrshopResultClient])('실제 상점의 결제/결과 직접 진입에서도 Mock 주문을 조회하지 않는다', async Client => {
    navigation.query = '?storeSlug=shop1234&orderId=qr-existing-mock';
    const getOrder = vi.spyOn(qrshopMockService, 'getOrder');
    render(<Client />);
    expect(await screen.findByText(PAYMENT_SESSION_MISSING)).toBeInTheDocument();
    expect(getOrder).not.toHaveBeenCalled();
    expect(screen.queryByText('Mock 결제')).not.toBeInTheDocument();
  });
  it.each([QrshopPayClient, QrshopResultClient])('기존 Mock 주문을 표시하다 실제 상점으로 전환해도 이전 결제 UI를 즉시 숨긴다', async Client => {
    navigation.query = '?orderId=qr-existing-mock';
    vi.spyOn(qrshopMockService, 'getOrder').mockResolvedValue({
      orderId: 'qr-existing-mock', orderCode: '123', status: Client === QrshopPayClient ? 'pending' : 'paid', totalAmount: 1000,
      lines: [], buyerName: '', buyerPhone: '', paymentMethod: 'online', createdAt: '2026-11-07T00:00:00Z',
    });
    const view = render(<Client />);
    await screen.findByText('123');
    navigation.query = '?storeSlug=shop1234&orderId=qr-existing-mock';
    view.rerender(<Client />);
    expect(await screen.findByText(PAYMENT_SESSION_MISSING)).toBeInTheDocument();
    expect(screen.queryByText('123')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '결제 완료하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '결제가 완료되었습니다' })).not.toBeInTheDocument();
  });

});
