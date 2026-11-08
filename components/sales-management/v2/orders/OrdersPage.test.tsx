import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockOrdersService } from '@/lib/mocks/orders-service';
import { seoulOrderDate, type OrdersResult, type OrdersService, type SalesOrder } from '@/lib/services/orders-service';
import OrdersPage from './OrdersPage';

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const today = seoulOrderDate();
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
function order(index: number): SalesOrder {
  return { id: `order-${index}`, orderNo: String(index).padStart(3, '0'), orderedAt: `${today}T10:00:00+09:00`, items: [{ productName: '키링', optionName: 'BLACK', quantity: 1 }], paymentMethod: index % 2 ? 'card' : 'online', paymentAmount: 3000, refundStatus: 'none' };
}

describe('전체 주문조회', () => {
  it('6열·Mock/환불 안내와 현재 화면 제목·선택 메뉴를 표시한다', async () => {
    render(<OrdersPage />);
    expect(screen.getByText('주문을 불러오는 중입니다.')).toBeInTheDocument();
    await screen.findByText('총 3건');
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['주문시각', '주문번호', '상품명/옵션', '결제수단', '결제금액', '환불']);
    expect(screen.getByRole('button', { name: '환불신청' })).toBeEnabled();
    expect(screen.getByText('환불 대기')).toBeInTheDocument();
    expect(screen.getByText('환불 완료')).toBeInTheDocument();
    expect(screen.getByText(/실제 주문 및 POS 판매 내역과 연결되지/)).toBeInTheDocument();
    expect(screen.getByText(/실제 결제 취소·환불 및 상품 재고 변경은 실행되지/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '전체 주문 조회' }));
    expect(screen.getByRole('link', { name: '전체 주문 조회' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '현장 포스' })).toHaveAttribute('href', '/sales-management/v2/pos');
    expect(screen.getByRole('button', { name: '직원 관리' })).toBeEnabled();
  });
  it('온라인·현장 필터와 상품/옵션 검색을 결합하며 빈 검색 결과를 표시한다', async () => {
    render(<OrdersPage />);
    await screen.findByText('총 3건');
    fireEvent.click(screen.getByRole('button', { name: '온라인결제' }));
    await screen.findByText('총 1건');
    expect(rows()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '현장결제' }));
    await screen.findByText('총 2건');
    fireEvent.change(screen.getByRole('searchbox', { name: '상품 검색' }), { target: { value: 'BLACK' } });
    await screen.findByText('총 1건');
    expect(rows()[0]).toHaveTextContent('고양이 키링(BLACK)×2');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '없는상품' } });
    await screen.findByText('검색 결과가 없습니다.');
    expect(screen.getByText('총 0건')).toBeInTheDocument();
  });
  it('이전/다음 날짜·달력 선택을 지원하고 오늘 이후 이동을 제한한다', async () => {
    const service = createMockOrdersService();
    const list = vi.spyOn(service, 'listOrders');
    render(<OrdersPage service={service} />);
    await screen.findByText('총 3건');
    expect(screen.getByRole('button', { name: '다음 날짜' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '이전 날짜' }));
    await screen.findByText('주문 목록이 없습니다');
    expect(screen.getByRole('button', { name: '다음 날짜' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '다음 날짜' }));
    await screen.findByText('총 3건');
    fireEvent.change(screen.getByLabelText('조회 날짜'), { target: { value: '2020-01-01' } });
    await screen.findByText('주문 목록이 없습니다');
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ date: '2020-01-01', page: 1 }));
    fireEvent.change(screen.getByLabelText('조회 날짜'), { target: { value: '2099-01-01' } });
    expect(screen.getByLabelText('조회 날짜')).toHaveValue('2020-01-01');
  });
  it('30건 페이지 이동 후 필터·검색·날짜 변경 시 첫 페이지로 돌아간다', async () => {
    const service = createMockOrdersService(Array.from({ length: 31 }, (_, i) => order(i + 1)));
    const list = vi.spyOn(service, 'listOrders');
    render(<OrdersPage service={service} />);
    await screen.findByText('총 31건');
    expect(rows()).toHaveLength(30);
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    await screen.findByText('2 / 2');
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '현장결제' }));
    await screen.findByText('총 16건');
    expect(rows()).toHaveLength(16);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'BLACK' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'BLACK' })));
    fireEvent.click(screen.getByRole('button', { name: '이전 날짜' }));
    await screen.findByText('검색 결과가 없습니다.');
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });
  it('실패 시 예시 목록을 표시하지 않고 재시도하며 오래된 응답은 무시한다', async () => {
    let resolveOld!: (value: OrdersResult) => void;
    const listOrders = vi.fn<OrdersService['listOrders']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ orders: [], total: 0, page: 1 });
    render(<OrdersPage service={{ listOrders, refundOrder: vi.fn() }} />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(screen.getByText('주문을 불러오는 중입니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '온라인결제' }));
    await screen.findByText('총 0건');
    await act(async () => resolveOld({ orders: [order(1)], total: 1, page: 1 }));
    expect(screen.getByText('총 0건')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Mock 환불', () => {
  it.each(['취소', 'Escape'])('%s로 닫으면 처리 없이 버튼에 포커스를 돌려준다', async action => {
    const service = createMockOrdersService([order(1)]);
    const refund = vi.spyOn(service, 'refundOrder');
    render(<OrdersPage service={service} />);
    const trigger = await screen.findByRole('button', { name: '환불신청' });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '환불 신청 확인' });
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveTextContent('주문번호 [001] 환불 처리합니다.재고를 복원하시겠습니까?');
    expect(dialog).toHaveTextContent('환불 완료 후 취소는 불가능합니다.');
    expect(within(dialog).getAllByRole('button').map(button => button.textContent)).toEqual(['취소', '재고 유지', '재고 복원']);
    if (action === 'Escape') fireEvent(dialog, new Event('cancel', { cancelable: true }));
    else fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(refund).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '환불신청' })).toBeEnabled();
  });

  it.each([
    ['online', false, '환불 처리되었습니다 (재고 유지)', null],
    ['online', true, '환불 처리되었습니다 (재고 복원 완료)', null],
    ['card', false, '결제수단에 맞는 방법으로 별도 환불을 진행해주세요 (재고 유지)', '카드 결제는 카드 단말기에서 별도 취소해주세요.'],
    ['card', true, '결제수단에 맞는 방법으로 별도 환불을 진행해주세요 (재고 복원 완료)', '카드 결제는 카드 단말기에서 별도 취소해주세요.'],
    ['cash', false, '결제수단에 맞는 방법으로 별도 환불을 진행해주세요 (재고 유지)', '현금 결제는 고객에게 현금으로 별도 환불해주세요.'],
    ['transfer', true, '결제수단에 맞는 방법으로 별도 환불을 진행해주세요 (재고 복원 완료)', '계좌이체 결제는 고객 계좌로 별도 송금해주세요.'],
  ] as const)('%s·복원 %s는 정확한 완료 안내·행 상태·수동 안내를 표시한다', async (method, restore, message, help) => {
    const target = { ...order(1), paymentMethod: method };
    const service = createMockOrdersService([target, { ...order(2), refundStatus: 'pending' }, { ...order(3), refundStatus: 'refunded' }]);
    const refund = vi.spyOn(service, 'refundOrder');
    const fetch = vi.spyOn(globalThis, 'fetch');
    render(<OrdersPage service={service} />);
    fireEvent.click(await screen.findByRole('button', { name: '환불신청' }));
    fireEvent.click(screen.getByRole('button', { name: restore ? '재고 복원' : '재고 유지' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(`Mock 예시 · ${message}`);
    expect(screen.queryByRole('button', { name: '환불신청' })).not.toBeInTheDocument();
    expect(screen.getAllByText('환불 완료')).toHaveLength(2);
    expect(screen.getByText('환불 대기')).toBeInTheDocument();
    expect(rows().find(row => row.id === 'order-order-1')).toHaveFocus();
    if (help) expect(screen.getByText(help)).toBeInTheDocument();
    expect(refund).toHaveBeenCalledExactlyOnceWith(target.id, restore);
    expect(fetch).not.toHaveBeenCalled();
    // Re-querying the same Mock store keeps the refunded row blocked.
    fireEvent.click(screen.getByRole('button', { name: method === 'online' ? '온라인결제' : '현장결제' }));
    await waitFor(() => expect(screen.queryByText('주문을 불러오는 중입니다.')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '환불신청' })).not.toBeInTheDocument();
  });

  it('처리 중 중복 실행·취소·Escape·배경 닫기를 막고 성공 후 해당 행만 갱신한다', async () => {
    const service = createMockOrdersService([order(1), order(2)]);
    let finish!: (value: SalesOrder) => void;
    const refund = vi.spyOn(service, 'refundOrder').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<OrdersPage service={service} />);
    fireEvent.click((await screen.findAllByRole('button', { name: '환불신청' }))[1]);
    const dialog = screen.getByRole('dialog');
    const keep = within(dialog).getByRole('button', { name: '재고 유지' });
    fireEvent.click(keep); fireEvent.click(keep);
    fireEvent.click(within(dialog).getByRole('button', { name: '재고 복원' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(within(dialog).getByRole('status')).toHaveTextContent('Mock 환불 처리 중입니다.');
    within(dialog).getAllByRole('button').forEach(button => expect(button).toBeDisabled());
    expect(refund).toHaveBeenCalledExactlyOnceWith('order-1', false);
    await act(async () => finish({ ...order(1), refundStatus: 'refunded', refundRestoreStock: false }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent('002');
    expect(within(rows()[0]).getByRole('button', { name: '환불신청' })).toBeEnabled();
    expect(rows()[1]).toHaveTextContent('환불 완료');
  });

  it('실패 시 목록·선택 주문을 보존하고 동일 모달에서 재시도한다', async () => {
    const service = createMockOrdersService([order(1), order(2)]);
    const original = service.refundOrder;
    const refund = vi.spyOn(service, 'refundOrder').mockRejectedValueOnce(new Error('failed')).mockImplementation(original);
    const list = vi.spyOn(service, 'listOrders');
    render(<OrdersPage service={service} />);
    fireEvent.click((await screen.findAllByRole('button', { name: '환불신청' }))[1]);
    const originalRows = rows().map(row => row.textContent);
    fireEvent.click(screen.getByRole('button', { name: '재고 복원' }));
    await screen.findByRole('alert');
    expect(rows().map(row => row.textContent)).toEqual(originalRows);
    expect(screen.queryByText(/Mock 예시 · 환불 처리되었습니다/)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('주문번호 [001]');
    expect(screen.getByRole('button', { name: '취소' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '재고 복원' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('(재고 복원 완료)');
    expect(rows()[1]).toHaveTextContent('환불 완료');
    expect(refund).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
