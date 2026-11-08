import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queuePaymentReturn, savePaymentSession } from '@/lib/qrshop/payment-session';
import QrshopPayClient from './QrshopPayClient';
import QrshopResultClient from './QrshopResultClient';
import QrshopOrderClient from './QrshopOrderClient';

const navigation = vi.hoisted(() => ({ push: vi.fn(), query: '' }));
const member = vi.hoisted(() => ({ status: 'unauthenticated', id: 'member1', load: vi.fn() }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: member.status, data: member.status === 'authenticated' ? { user: { id: member.id } } : null }) }));
vi.mock('@/lib/qrshop/buyer-profile', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/qrshop/buyer-profile')>(), getQrshopBuyer: member.load }));
const sdk = vi.hoisted(() => ({ requestPayment: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation, useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock('@portone/browser-sdk/v2', () => sdk);
const session = { storeSlug: 'shop1234', guestToken: 'private-token', payment: { storeId: 'ps1', channelKey: 'ch1', orderName: '서버 주문명' } };
const order = { orderId: 'order1', orderNo: null as number | null, paymentAmount: 6200, paymentStatus: 'PENDING',
  failureCode: 'PAYMENT_NOT_COMPLETED' as string | null, failureMessage: '서버 미결제 안내' as string | null,
  orderedAt: '2026-11-07T00:00:00Z', store: { name: '상점', storeSlug: 'shop1234' },
  items: [{ name: '상품', optionName: '선택', unitPrice: 3100, quantity: 2, soldOut: false }] };
const paid = { ...order, paymentStatus: 'PAID', orderNo: 23, failureCode: null, failureMessage: null };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data }) });

beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks();
  member.status = 'unauthenticated'; member.id = 'member1'; member.load.mockReset();
  navigation.query = '?orderId=order1&storeSlug=shop1234';
  savePaymentSession('order1', session);
  sdk.requestPayment.mockResolvedValue({ paymentId: 'order1' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('QRshop 실제 결제 경로', () => {
  it('회원정보가 모두 있으면 입력 화면 없이 SDK를 1회 열고 개인정보를 저장하지 않는다', async () => {
    member.status = 'authenticated';
    member.load.mockResolvedValue({ email: 'member@example.com', phone: '01000000000', name: '회원' });
    sdk.requestPayment.mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ok(url.endsWith('/verify') ? { verified: false } : order)));
    render(<StrictMode><QrshopPayClient /></StrictMode>);
    await waitFor(() => expect(sdk.requestPayment).toHaveBeenCalledTimes(1));
    expect(sdk.requestPayment).toHaveBeenCalledWith(expect.objectContaining({ customer: { email: 'member@example.com', phoneNumber: '01000000000', fullName: '회원' } }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('결제를 진행해 주세요')).not.toBeInTheDocument();
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('member@example.com');
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('회원 휴대폰이 없으면 번호만 입력받고 나머지 회원정보를 SDK에 사용한다', async () => {
    member.status = 'authenticated';
    member.load.mockResolvedValue({ email: 'member@example.com', phone: '', name: '회원' });
    sdk.requestPayment.mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ok(url.endsWith('/verify') ? { verified: false } : order)));
    render(<QrshopPayClient />);
    const phone = await screen.findByLabelText('구매자 휴대폰 번호');
    expect(screen.queryByLabelText('구매자 이메일')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('구매자 이름')).not.toBeInTheDocument();
    expect(sdk.requestPayment).not.toHaveBeenCalled();
    fireEvent.change(phone, { target: { value: '010-0000-0000' } });
    fireEvent.click(screen.getByRole('button', { name: '결제창 열기' }));
    await waitFor(() => expect(sdk.requestPayment).toHaveBeenCalledWith(expect.objectContaining({ customer: { email: 'member@example.com', phoneNumber: '01000000000', fullName: '회원' } })));
  });

  it('회원정보 조회 실패는 빈 폼이나 SDK 대신 재확인을 제공한다', async () => {
    member.status = 'authenticated'; member.load.mockRejectedValue(new Error('private failure'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(order)));
    render(<QrshopPayClient />);
    await screen.findByRole('heading', { name: '회원정보를 확인할 수 없습니다' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('private failure')).not.toBeInTheDocument();
    expect(sdk.requestPayment).not.toHaveBeenCalled();
  });

  it('계정 전환 전의 늦은 회원정보는 화면과 SDK에 반영하지 않는다', async () => {
    member.status = 'authenticated';
    let finish!: (buyer: { email: string; phone: string; name: string }) => void;
    member.load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue({ email: '', phone: '', name: '' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(order)));
    const view = render(<QrshopPayClient />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    member.id = 'member2'; view.rerender(<QrshopPayClient />);
    await screen.findByLabelText('구매자 이메일');
    await act(async () => { finish({ email: 'previous@example.com', phone: '01000000000', name: '이전 회원' }); });
    expect(screen.getByLabelText('구매자 이메일')).toHaveValue('');
    expect(sdk.requestPayment).not.toHaveBeenCalled();
  });

  it('구매자 이름 누락·공백은 SDK 호출 전에 차단한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(order)));
    render(<QrshopPayClient />);
    const button = await screen.findByRole('button', { name: '결제창 열기' });
    fireEvent.change(screen.getByLabelText('구매자 이메일'), { target: { value: 'buyer@example.com' } });
    fireEvent.change(screen.getByLabelText('구매자 휴대폰 번호'), { target: { value: '010-0000-0000' } });
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText('구매자 이름'), { target: { value: '   ' } });
    fireEvent.click(button);
    expect(sdk.requestPayment).not.toHaveBeenCalled();
  });

  it('휴대폰 누락·잘못된 형식은 SDK 호출 전에 차단한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(order)));
    render(<QrshopPayClient />);
    const button = await screen.findByRole('button', { name: '결제창 열기' });
    fireEvent.change(screen.getByLabelText('구매자 이메일'), { target: { value: 'buyer@example.com' } });
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText('구매자 휴대폰 번호'), { target: { value: 'invalid' } });
    fireEvent.click(button);
    expect(sdk.requestPayment).not.toHaveBeenCalled();
  });

  it('이메일 누락·잘못된 형식은 SDK 호출 전에 차단한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(order)));
    render(<QrshopPayClient />);
    const button = await screen.findByRole('button', { name: '결제창 열기' });
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText('구매자 이메일'), { target: { value: 'invalid' } });
    fireEvent.click(button);
    expect(sdk.requestPayment).not.toHaveBeenCalled();
  });

  it('중복 클릭은 SDK를 한 번 열고 서버 검증 후 상점을 유지한 결과 경로로 이동한다', async () => {
    let finish!: (value: unknown) => void;
    sdk.requestPayment.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    let isPaid = false;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ok(url.endsWith('/verify') ? { verified: isPaid } : isPaid ? paid : order)));
    render(<QrshopPayClient />);
    const button = await screen.findByRole('button', { name: '결제창 열기' });
    expect(screen.queryByText('Mock 결제')).not.toBeInTheDocument();
    expect(screen.queryByText('주문번호')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('구매자 이메일'), { target: { value: 'buyer@example.com' } });
    fireEvent.change(screen.getByLabelText('구매자 휴대폰 번호'), { target: { value: '010-0000-0000' } });
    fireEvent.change(screen.getByLabelText('구매자 이름'), { target: { value: '  테스트 구매자  ' } });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(sdk.requestPayment).toHaveBeenCalledTimes(1));
    expect(sdk.requestPayment).toHaveBeenCalledWith(expect.objectContaining({ customer: { email: 'buyer@example.com', phoneNumber: '01000000000', fullName: '테스트 구매자' } }));
    expect(screen.getByRole('button', { name: '처리 중…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '상품 선택으로 돌아가기' })).toBeDisabled();
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(navigation.push).not.toHaveBeenCalled();
    isPaid = true;
    await act(async () => { finish({ paymentId: 'order1' }); });
    expect(navigation.push).toHaveBeenCalledWith('/QRshop/result?orderId=order1&storeSlug=shop1234');
    expect(JSON.stringify(navigation.push.mock.calls)).not.toContain(session.guestToken);
  });

  it('결제 후 검증 통신 오류는 SDK를 재실행하지 않고 상태 확인만 재시도한다', async () => {
    let verifyCount = 0;
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/verify')) {
        verifyCount += 1;
        if (verifyCount === 2) throw new Error('검증 통신 오류');
        return ok({ verified: verifyCount > 2 });
      }
      return ok(verifyCount > 2 ? paid : order);
    });
    vi.stubGlobal('fetch', fetcher);
    render(<QrshopPayClient />);
    await screen.findByRole('button', { name: '결제창 열기' });
    fireEvent.change(screen.getByLabelText('구매자 이메일'), { target: { value: 'buyer@example.com' } });
    fireEvent.change(screen.getByLabelText('구매자 휴대폰 번호'), { target: { value: '010-0000-0000' } });
    fireEvent.change(screen.getByLabelText('구매자 이름'), { target: { value: '  테스트 구매자  ' } });
    fireEvent.click(screen.getByRole('button', { name: '결제창 열기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('검증 통신 오류');
    expect(screen.queryByRole('heading', { name: '결제가 완료되었습니다' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '결제 상태 다시 확인' }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledTimes(1));
    expect(sdk.requestPayment).toHaveBeenCalledTimes(1);
  });

  it('사전 검증 대기 중 상점/주문을 전환하면 늦은 요청은 SDK·화면·라우팅을 바꾸지 않는다', async () => {
    let finish!: (value: ReturnType<typeof ok>) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(ok(order))
      .mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(ok(order));
    vi.stubGlobal('fetch', fetcher);
    const view = render(<QrshopPayClient />);
    await screen.findByRole('button', { name: '결제창 열기' });
    fireEvent.change(screen.getByLabelText('구매자 이메일'), { target: { value: 'buyer@example.com' } });
    fireEvent.change(screen.getByLabelText('구매자 휴대폰 번호'), { target: { value: '010-0000-0000' } });
    fireEvent.change(screen.getByLabelText('구매자 이름'), { target: { value: '  테스트 구매자  ' } });
    fireEvent.click(screen.getByRole('button', { name: '결제창 열기' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    navigation.query = '?orderId=other&storeSlug=next1234';
    view.rerender(<QrshopPayClient />);
    await screen.findByRole('heading', { name: '결제를 시작할 수 없습니다' });
    await act(async () => { finish(ok({ verified: false })); });
    expect(sdk.requestPayment).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: '결제를 시작할 수 없습니다' })).toBeInTheDocument();
    expect(screen.queryByText('6,200원')).not.toBeInTheDocument();
  });

  it('리다이렉트 성공 쿼리를 신뢰하지 않고 서버 verify+GET의 PAID만 완료로 표시한다', async () => {
    navigation.query += '&paymentId=order1&code=FAKE_SUCCESS';
    const fetcher = vi.fn().mockResolvedValueOnce(ok({ verified: true, paymentStatus: 'PAID' })).mockResolvedValueOnce(ok(paid));
    vi.stubGlobal('fetch', fetcher);
    const view = render(<QrshopResultClient />);
    expect(await screen.findByRole('heading', { name: '결제가 완료되었습니다' })).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/v2/qrshop/orders/order1/payment/verify', { method: 'POST', headers: { 'X-Guest-Token': session.guestToken } });
    expect(sdk.requestPayment).not.toHaveBeenCalled();
    view.unmount(); // A fresh page/service still uses this order's session, not React state.
    fetcher.mockResolvedValueOnce(ok({ verified: true })).mockResolvedValueOnce(ok(paid));
    render(<QrshopResultClient />);
    await screen.findByRole('heading', { name: '결제가 완료되었습니다' });
    fireEvent.click(screen.getByRole('button', { name: '처음으로' }));
    expect(navigation.push).toHaveBeenLastCalledWith('/QRshop?storeSlug=shop1234');
  });

  it.each([
    ['PENDING', 'PAYMENT_NOT_COMPLETED', '결제가 완료되지 않았습니다.'],
    ['FAILED', 'PAYMENT_FAILED', '결제가 실패되었습니다.'],
    ['CANCELED', 'PAYMENT_CANCELED', '결제가 취소되었습니다.'],
    ['CANCELED', 'STOCK_SHORTAGE', '해당 상품 품절로 전체 결제가 취소되었습니다.'],
    ['CANCELED', 'REFUND_PENDING', '해당 상품 품절로 전체 결제가 취소되었습니다.'],
  ])('%s/%s는 성공으로 표시하지 않는다', async (paymentStatus, failureCode, title) => {
    navigation.query += '&success=true';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ verified: false })).mockResolvedValueOnce(ok({ ...order, paymentStatus, failureCode, failureMessage: '서버 사유 보존' })));
    render(<QrshopResultClient />);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.queryByText('서버 사유 보존')).not.toBeInTheDocument();
    expect(screen.queryByText('결제가 완료되었습니다')).not.toBeInTheDocument();
    expect(screen.queryByText('23')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '처음으로' }));
    expect(navigation.push).toHaveBeenCalledWith('/QRshop?storeSlug=shop1234');
    expect(sessionStorage.getItem('gcs:qrshop:return:shop1234')).toBeNull();
  });

  it('결과 검증 실패는 성공 화면 없이 재확인하며 새 결제창을 열지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('네트워크 오류'))
      .mockResolvedValueOnce(ok({ verified: true })).mockResolvedValueOnce(ok(paid)));
    render(<QrshopResultClient />);
    expect(await screen.findByText('네트워크 오류')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }));
    await screen.findByRole('heading', { name: '결제가 완료되었습니다' });
    expect(sdk.requestPayment).not.toHaveBeenCalled();
  });

  it.each(['STOCK_SHORTAGE', 'REFUND_PENDING'])('%s는 품절 항목만 표시하고 환불 대기와 취소 안내를 구분한다', async failureCode => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ verified: false })).mockResolvedValueOnce(ok({
      ...order, paymentStatus: 'CANCELED', failureCode,
      items: [order.items[0], { ...order.items[0], name: '품절 옵션 상품', soldOut: true },
        { ...order.items[0], name: '품절 단일 상품', optionName: null, soldOut: true }],
    })));
    render(<QrshopResultClient />);
    await screen.findByRole('heading', { name: '해당 상품 품절로 전체 결제가 취소되었습니다.' });
    const items = screen.getByRole('list', { name: '품절 상품 목록' });
    expect(items).toHaveClass('min-h-0', 'overflow-y-auto');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('품절 옵션 상품')).toBeInTheDocument();
    expect(screen.getByText('옵션 없음 / 2개')).toBeInTheDocument();
    expect(screen.queryByText('상품', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '결제 결과 요약' })).not.toBeInTheDocument();
    if (failureCode === 'REFUND_PENDING') {
      expect(screen.getByText('환불 확인이 필요합니다. 상점 직원에게 문의해주세요.')).toBeInTheDocument();
      expect(screen.queryByText('결제된 금액은 환불 예정입니다.')).not.toBeInTheDocument();
    } else expect(screen.getByText('결제된 금액은 환불 예정입니다.')).toBeInTheDocument();
    expect(screen.queryByText(/환불.*완료/)).not.toBeInTheDocument();
  });

  it('일반 취소에서는 soldOut 항목이 있어도 품절 목록을 노출하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ verified: false })).mockResolvedValueOnce(ok({
      ...order, paymentStatus: 'CANCELED', failureCode: 'PAYMENT_CANCELED', items: [{ ...order.items[0], soldOut: true }],
    })));
    render(<QrshopResultClient />);
    await screen.findByRole('heading', { name: '결제가 취소되었습니다.' });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  const catalog = { store: { storeId: 's1', storeSlug: 'shop1234', name: '상점' }, categories: [],
    products: [{ productId: 'p1', name: '상품', price: 3100, categoryId: null, imageUrl: null, hasOption: false, soldOut: false, stock: 2, options: [] }] };

  it('paid 처음으로 복귀는 서버 번호를 1회 표시하고 자동 닫힘·새로고침·결과 재방문 후 재노출하지 않는다', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => ok(url.endsWith('/verify') ? { verified: true } : url.includes('/orders/') ? paid : catalog));
    vi.stubGlobal('fetch', fetcher);
    const result = render(<QrshopResultClient />);
    await screen.findByRole('heading', { name: '결제가 완료되었습니다' });
    expect(sessionStorage.getItem('gcs:qrshop:return:shop1234')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '처음으로' }));
    result.unmount();
    navigation.query = '?storeSlug=shop1234&orderNo=999';
    vi.useFakeTimers();
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StrictMode><QrshopOrderClient /></StrictMode>); });
    expect(screen.getByRole('status')).toHaveTextContent('주문번호 23');
    expect(screen.queryByText('주문번호 999')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('gcs:qrshop:return:shop1234')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '주문번호 23 결과 보기' }));
    expect(navigation.push).toHaveBeenLastCalledWith('/QRshop/result?orderId=order1&storeSlug=shop1234');
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByText('주문번호 23')).not.toBeInTheDocument();
    view.unmount();
    await act(async () => { view = render(<QrshopOrderClient />); });
    expect(screen.queryByText('주문번호 23')).not.toBeInTheDocument();
    view.unmount();
    navigation.query = '?orderId=order1&storeSlug=shop1234';
    await act(async () => { view = render(<QrshopResultClient />); });
    fireEvent.click(screen.getByRole('button', { name: '처음으로' }));
    expect(sessionStorage.getItem('gcs:qrshop:return:shop1234')).toBeNull();
    expect(JSON.stringify(navigation.push.mock.calls)).not.toContain(session.guestToken);
  });

  it('URL의 주문번호만으로 토스트를 만들거나 주문을 재조회하지 않는다', async () => {
    navigation.query = '?storeSlug=shop1234&orderId=order1&orderCode=999&success=true';
    const fetcher = vi.fn().mockResolvedValue(ok(catalog)); vi.stubGlobal('fetch', fetcher);
    render(<QrshopOrderClient />);
    await screen.findByRole('heading', { name: '상점' });
    expect(screen.queryByText(/주문번호/)).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['PENDING', 'CANCELED'])('복귀 후 서버가 %s이면 번호를 표시하지 않고 마커를 소비한다', async paymentStatus => {
    queuePaymentReturn('order1', 'shop1234');
    navigation.query = '?storeSlug=shop1234';
    const fetcher = vi.fn().mockResolvedValueOnce(ok(catalog)).mockResolvedValueOnce(ok({ ...paid, paymentStatus,
      failureCode: paymentStatus === 'PENDING' ? 'PAYMENT_NOT_COMPLETED' : 'PAYMENT_CANCELED' }));
    vi.stubGlobal('fetch', fetcher);
    render(<QrshopOrderClient />);
    await waitFor(() => expect(sessionStorage.getItem('gcs:qrshop:return:shop1234')).toBeNull());
    expect(screen.queryByText(/주문번호/)).not.toBeInTheDocument();
  });

  it('다른 상점의 복귀 마커를 사용하지 않는다', async () => {
    queuePaymentReturn('order1', 'shop1234');
    navigation.query = '?storeSlug=next1234';
    const fetcher = vi.fn().mockResolvedValue(ok(catalog)); vi.stubGlobal('fetch', fetcher);
    render(<QrshopOrderClient />);
    await screen.findByRole('heading', { name: '상점' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/주문번호/)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('gcs:qrshop:return:shop1234')).toBe('order1');
  });

  it('복귀 재조회 실패에서는 번호를 표시하지 않는다', async () => {
    queuePaymentReturn('order1', 'shop1234'); navigation.query = '?storeSlug=shop1234';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok(catalog)).mockRejectedValueOnce(new Error('통신 오류')));
    render(<QrshopOrderClient />);
    await waitFor(() => expect(sessionStorage.getItem('gcs:qrshop:return:shop1234')).toBeNull());
    expect(screen.queryByText(/주문번호/)).not.toBeInTheDocument();
  });

  it('paid 복귀 마커 저장이 차단되어도 처음으로 이동한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ verified: true })).mockResolvedValueOnce(ok(paid)));
    render(<QrshopResultClient />);
    await screen.findByRole('heading', { name: '결제가 완료되었습니다' });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    fireEvent.click(screen.getByRole('button', { name: '처음으로' }));
    expect(navigation.push).toHaveBeenLastCalledWith('/QRshop?storeSlug=shop1234');
    expect(sessionStorage.getItem('gcs:qrshop:return:shop1234')).toBeNull();
  });

  it('주문 생성 품절409는 동의를 해제하고 중복 주문과 결제 이동을 막는다', async () => {
    navigation.query = '?storeSlug=shop1234';
    const catalog = { store: { storeId: 's1', storeSlug: 'shop1234', name: '상점' }, categories: [],
      products: [{ productId: 'p1', name: '상품', price: 3100, categoryId: null, imageUrl: null, hasOption: false, soldOut: false, stock: 2, options: [] }] };
    let finish!: (value: unknown) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(ok(catalog)).mockResolvedValueOnce(ok(catalog))
      .mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    render(<QrshopOrderClient />);
    fireEvent.click(await screen.findByRole('button', { name: '상품 담기' }));
    fireEvent.click(screen.getByRole('checkbox'));
    const button = screen.getByRole('button', { name: '결제하기' }); fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    await act(async () => { finish({ ok: false, status: 409, json: async () => ({ status: 'error', code: 'SOLD_OUT', message: '품절된 상품' }) }); });
    expect(await screen.findByRole('alert')).toHaveTextContent('품절된 상품');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(sdk.requestPayment).not.toHaveBeenCalled();
  });
});
