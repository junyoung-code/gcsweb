import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockLandingV2Service, type LandingV2MockState } from '@/lib/mocks/sales-management-landing-v2-service';
import SalesManagementV2Provider from '../SalesManagementV2Provider';
import SalesManagementLandingV2 from '../SalesManagementLandingV2';
import StorePage from './StorePage';
import { StoreApiError } from '@/lib/services/sales-management-store-api-service';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/sales-management/v2/products', useSearchParams: () => new URLSearchParams() }));
beforeEach(() => {
  push.mockReset();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const change = (label: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
async function ready(state: LandingV2MockState = 'no-sales') {
  const service = createMockLandingV2Service(state);
  const view = render(<SalesManagementV2Provider service={service}><StorePage /></SalesManagementV2Provider>);
  await screen.findByRole('textbox', { name: '상점명' });
  return { service, view };
}

describe('v2 상점 수정·삭제', () => {
  it('유효한 이름과 확인된 아이디일 때만 등록할 수 있고 입력 변경 시 다시 검사한다', async () => {
    const { service } = await ready('empty');
    const save = vi.spyOn(service, 'saveStore');
    const submit = screen.getByRole('button', { name: '상점 등록하기' });
    expect(submit).toBeDisabled();
    change('상점명', '새 상점'); change('상점 아이디', 'myshop123');
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
    expect(submit).toBeDisabled();
    await screen.findByText('사용 가능한 아이디입니다.');
    expect(submit).toBeEnabled();
    change('상점명', ' ');
    expect(submit).toBeDisabled();
    change('상점명', '새 상점');
    expect(submit).toBeEnabled();
    change('상점 아이디', 'nextshop123');
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(save).not.toHaveBeenCalled();
  });

  it('기존 정보를 불러오고 QR을 유지하며 본인 아이디로 수정한 결과가 랜딩에 반영된다', async () => {
    const { service, view } = await ready('success');
    expect(screen.getByRole('textbox', { name: '상점명' })).toHaveValue('잇장샵');
    expect(screen.queryByRole('button', { name: '상점 삭제하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '방문객 주문 QR 열기' })).toHaveTextContent('QR 보기');
    expect(screen.getByRole('button', { name: '상점 정보 수정하기' })).toBeEnabled();
    change('상점 아이디', 'newshop123');
    expect(screen.getByRole('button', { name: '상점 정보 수정하기' })).toBeDisabled();
    change('상점 아이디', (await service.getStore())!.storeIdentifier);
    expect(screen.getByRole('button', { name: '상점 정보 수정하기' })).toBeEnabled();
    expect(screen.queryByText('상점 아이디를 수정할 경우 상점 URL과 QR코드가 새로 발급됩니다.')).not.toBeInTheDocument();
    change('상점명', '바뀐 상점');
    fireEvent.click(screen.getByRole('button', { name: '상점 정보 수정하기' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: '상점명' })).toHaveAttribute('readonly'));
    expect(screen.getByText('상점 아이디를 수정할 경우 상점 URL과 QR코드가 새로 발급됩니다.')).toBeInTheDocument();
    expect(screen.getByLabelText('방문객 주문 URL')).toHaveValue((await service.getStore())!.visitorOrderUrl);
    view.rerender(<SalesManagementV2Provider service={service}><SalesManagementLandingV2 /></SalesManagementV2Provider>);
    expect(await screen.findByRole('heading', { name: '바뀐 상점' })).toBeInTheDocument();
  });
  it('아이디 검증·중복 확인 후 등록하고 수정 중에도 QR 영역을 유지한다', async () => {
    await ready('empty');
    change('상점명', '새 상점'); change('상점 아이디', 'abc');
    expect(screen.getByRole('button', { name: '상점 등록하기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
    expect(screen.getByText('영문 소문자와 숫자로 4~20자 입력해주세요.')).toBeInTheDocument();
    change('상점 아이디', 'taken123'); fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
    expect(await screen.findByText('중복된 아이디입니다.')).toBeInTheDocument();
    change('상점 아이디', 'myshop123'); fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
    await screen.findByRole('img', { name: '사용 가능한 아이디' });
    fireEvent.click(screen.getByRole('button', { name: '상점 등록하기' }));
    await screen.findByLabelText('방문객 주문 URL');
    fireEvent.click(screen.getByRole('button', { name: '상점 정보 수정하기' }));
    expect(screen.getByRole('textbox', { name: '상점명' })).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('방문객 주문 URL')).toBeInTheDocument();
  });
  it('삭제 취소·실패 시 상태를 유지하고 재시도 성공 시 연결 상품까지 비운다', async () => {
    const { service, view } = await ready();
    fireEvent.click(screen.getByRole('button', { name: '상점 삭제하기' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect((await service.getProducts()).total).toBe(36);
    const remove = vi.spyOn(service, 'deleteStore').mockRejectedValueOnce(new Error('삭제 실패'));
    fireEvent.click(screen.getByRole('button', { name: '상점 삭제하기' }));
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('삭제 실패');
    expect((await service.getProducts()).total).toBe(36);
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sales-management/v2'));
    expect(remove).toHaveBeenCalledTimes(2);
    view.rerender(<SalesManagementV2Provider service={service}><SalesManagementLandingV2 /></SalesManagementV2Provider>);
    expect(await screen.findByText('아직 상점이 등록되지 않았어요!')).toBeInTheDocument();
    expect(screen.getByText('0개')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '최근 등록 상품' })).not.toBeInTheDocument();
  });
  it('삭제 처리 중 중복 클릭과 Escape 취소를 막는다', async () => {
    const { service } = await ready();
    let resolve!: () => void;
    const remove = vi.spyOn(service, 'deleteStore').mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    fireEvent.click(screen.getByRole('button', { name: '상점 삭제하기' }));
    const confirm = screen.getByRole('button', { name: '확인' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(confirm).toBeDisabled(); expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('중복 확인 응답이 늦게 와도 이후 입력을 확인된 아이디로 처리하지 않는다', async () => {
    const { service } = await ready('empty');
    let resolve!: (value: boolean) => void;
    vi.spyOn(service, 'checkStoreIdentifier').mockImplementation(() => new Promise<boolean>(done => { resolve = done; }));
    const save = vi.spyOn(service, 'saveStore');
    change('상점명', '새 상점'); change('상점 아이디', 'first123');
    fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
    change('상점 아이디', 'second123');
    await act(async () => resolve(true));
    fireEvent.click(screen.getByRole('button', { name: '상점 등록하기' }));
    expect(screen.getByRole('button', { name: '상점 등록하기' })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });
  it('QA: 상점명 지우기와 아이디 오류·성공 상태를 표시한다', async () => {
    await ready('empty');
    change('상점명', '새 상점');
    fireEvent.click(screen.getByRole('button', { name: '상점명 지우기' }));
    expect(screen.getByRole('textbox', { name: '상점명' })).toHaveValue('');
    change('상점 아이디', 'taken123');
    fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
    await screen.findByText('중복된 아이디입니다.');
    expect(screen.getByRole('img', { name: '아이디 확인 오류' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상점 등록하기' })).toBeDisabled();
    change('상점 아이디', 'myshop123');
    fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
    await screen.findByRole('img', { name: '사용 가능한 아이디' });
    expect(screen.getByText('사용 가능한 아이디입니다.')).toBeInTheDocument();
  });
  it('QA: 상점 QR에서 저장과 인쇄를 열고 실패 후 재시도한다', async () => {
    const { service } = await ready();
    vi.spyOn(service, 'getVisitorOrderQr').mockRejectedValueOnce(new Error('QR을 불러오지 못했어요.')).mockResolvedValue({ imageUrl: 'data:image/svg+xml,%3Csvg%2F%3E', visitorOrderUrl: 'https://example.com/QRshop/@abcd' });
    fireEvent.click(screen.getByRole('button', { name: '방문객 주문 QR 열기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('QR을 불러오지 못했어요.');
    fireEvent.click(screen.getByRole('button', { name: '방문객 주문 QR 열기' }));
    await screen.findByRole('dialog', { name: '방문객 주문 QR' });
    expect(screen.getByRole('button', { name: '인쇄' })).toBeDisabled();
    fireEvent.load(screen.getByAltText('방문객 주문 QR 코드'));
    expect(await screen.findByRole('link', { name: '이미지 저장' })).toHaveAttribute('download', '방문객-주문-QR.svg');
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: '인쇄' }));
    expect(print).toHaveBeenCalledOnce();
  });

});

describe('상점 API 오류와 Mock QR 경계', () => {
  it('조회 권한 오류를 표시하고 재시도로 빈 등록 화면을 연다', async () => {
    const service = createMockLandingV2Service('empty');
    vi.spyOn(service, 'getStore').mockRejectedValueOnce(new Error('로그인이 필요해요. 다시 로그인해주세요.'));
    render(<SalesManagementV2Provider service={service}><StorePage /></SalesManagementV2Provider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인이 필요해요.');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByRole('button', { name: '상점 등록하기' })).toBeDisabled();
  });
  it('판매 이력이 새로 생겨 서버가 삭제를 거절하면 화면과 오류를 유지한다', async () => {
    const { service } = await ready();
    vi.spyOn(service, 'deleteStore').mockRejectedValue(new Error('판매 이력이 있는 상점은 삭제할 수 없어요.'));
    fireEvent.click(screen.getByRole('button', { name: '상점 삭제하기' }));
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('판매 이력이 있는 상점은 삭제할 수 없어요.');
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '상점명' })).toHaveValue('잇장샵');
  });
  it('고정 Mock QR을 예시로 표시하고 저장과 인쇄를 막는다', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: '방문객 주문 QR 열기' }));
    fireEvent.load(await screen.findByAltText('방문객 주문 QR 코드'));
    expect(screen.getByText(/Mock 예시 QR입니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이미지 저장' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '인쇄' })).toBeDisabled();
  });
});


describe('API 선택과 폼 계약', () => {
  it('환경의 api 선택은 실제 endpoint를 요청하고 실패를 Mock으로 대체하지 않는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SALES_MANAGEMENT_DATA_SOURCE', 'api');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'error', code: 'UNAUTHORIZED' }), { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    render(<SalesManagementV2Provider><StorePage /></SalesManagementV2Provider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인이 필요해요.');
    expect(fetcher).toHaveBeenCalledWith('/api/v2/qrshop/stores/me', expect.anything());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('API 이름 길이와 중복확인 이후 409 충돌을 반영한다', async () => {
    const service = createMockLandingV2Service('empty');
    const apiService = { ...service, dataSource: 'api' as const };
    vi.spyOn(apiService, 'checkStoreIdentifier').mockResolvedValue(true);
    const save = vi.spyOn(apiService, 'saveStore').mockRejectedValue(new StoreApiError('STORE_SLUG_TAKEN', '이미 사용 중인 상점 아이디입니다. 다시 확인해주세요.', 409));
    render(<SalesManagementV2Provider service={apiService}><StorePage /></SalesManagementV2Provider>);
    await screen.findByRole('textbox', { name: '상점명' });
    change('상점명', '가'); change('상점 아이디', 'abcdefghijklmnopqrstu');
    fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
    await screen.findByText('사용 가능한 아이디입니다.');
    const submit = screen.getByRole('button', { name: '상점 등록하기' });
    expect(submit).toBeEnabled();
    change('상점명', '가'.repeat(17)); expect(submit).toBeDisabled();
    change('상점명', '가'); fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('다시 확인해주세요.');
    expect(save).toHaveBeenCalledOnce(); expect(submit).toBeDisabled();
    expect(screen.getByText('중복된 아이디입니다.')).toBeInTheDocument();
  });
});
