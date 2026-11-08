import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockLandingV2Service } from '@/lib/mocks/sales-management-landing-v2-service';
import SalesManagementV2Provider from '../SalesManagementV2Provider';
import { StoreApiError } from '@/lib/services/sales-management-store-api-service';
import ProductsPage from './ProductsPage';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/sales-management/v2/products', useSearchParams: () => new URLSearchParams() }));
beforeEach(() => {
  push.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); this.querySelector('button')?.focus(); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function ready({ form = false, count = 36, id }: { form?: boolean; count?: number; id?: string } = {}) {
  const service = createMockLandingV2Service('success', { catalog: true, productCount: count });
  const view = render(<SalesManagementV2Provider service={service}><ProductsPage form={form} productId={id} /></SalesManagementV2Provider>);
  if (form) await screen.findByLabelText('상품명'); else await screen.findByLabelText('상품 검색');
  return { service, view };
}

describe('상품 관리 v2 화면', () => {
  it.each([false, true])('목록 및 등록 화면에서 판매 이력이 있는 큰 카드는 수정만 표시한다 (form=%s)', async form => {
    await ready({ form, count: 3 });
    const cards = within(screen.getByRole('list', { name: '상품 목록' })).getAllByRole('listitem');
    expect(within(cards[0]).getByRole('button', { name: /삭제/ })).toBeInTheDocument();
    expect(within(cards[2]).queryByRole('button', { name: /삭제/ })).not.toBeInTheDocument();
    expect(within(cards[2]).getByRole('link', { name: /수정/ })).toBeInTheDocument();
  });
  it('20개 경계, 검색과 카테고리 조합, 조건 변경 시 1페이지를 적용한다', async () => {
    await ready();
    const items = () => within(screen.getByRole('list', { name: '상품 목록' })).getAllByRole('listitem');
    expect(items()).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' })); expect(items()).toHaveLength(16);
    change('상품 검색', '가방'); expect(items()).toHaveLength(20);
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: '카테고리 필터' })); fireEvent.click(screen.getByRole('button', { name: '신발' }));
    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
    change('상품 검색', ''); expect(items()).toHaveLength(3);
  });
  it('마지막 페이지의 삭제 취소·실패는 유지하고 성공하면 이전 페이지로 이동한다', async () => {
    const { service } = await ready({ count: 21 });
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    fireEvent.click(screen.getByRole('button', { name: '무슨무슨가방 삭제' })); fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect((await service.getProducts()).total).toBe(21);
    vi.spyOn(service, 'deleteProduct').mockRejectedValueOnce(new Error('failure'));
    fireEvent.click(screen.getByRole('button', { name: '무슨무슨가방 삭제' })); fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('처리하지 못했어요.');
    expect((await service.getProducts()).total).toBe(21);
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(screen.getByRole('list', { name: '상품 목록' })).getAllByRole('listitem')).toHaveLength(20);
    expect(screen.queryByRole('navigation', { name: '페이지네이션' })).not.toBeInTheDocument();
  });
  it('빈 숫자·음수·소수를 거절하고 0은 허용하며 실패 후 입력을 보존한다', async () => {
    const { service } = await ready({ form: true, count: 0 });
    const submit = screen.getByRole('button', { name: '상품 등록하기' });
    change('상품명', '무료 샘플'); change('가격', '0'); expect(submit).toBeDisabled();
    for (const value of ['-1', '1.5', '']) { change('총재고', value); expect(submit).toBeDisabled(); }
    change('총재고', '0'); expect(submit).toBeEnabled();
    vi.spyOn(service, 'saveProduct').mockRejectedValueOnce(new Error('failure'));
    fireEvent.click(submit); fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument(); expect(screen.getByLabelText('상품명')).toHaveValue('무료 샘플');
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('상품명')).toHaveValue(''); expect(screen.getByText('NEW')).toBeInTheDocument();
    expect((await service.getSellerSummary()).productCount).toBe(1);
  });
  it('Enter 카테고리 생성, 옵션 합산·추가금·마지막 옵션 삭제를 처리한다', async () => {
    const { service } = await ready({ form: true, count: 0 });
    fireEvent.focus(screen.getByLabelText('카테고리')); change('카테고리 검색 및 생성', '새 분류'); fireEvent.keyDown(screen.getByLabelText('카테고리 검색 및 생성'), { key: 'Enter' });
    await screen.findByRole('button', { name: '카테고리 해제' });
    expect(await service.getCategories()).toContain('새 분류');
    change('상품명', '옵션 상품'); change('가격', '1000');
    fireEvent.click(screen.getByRole('radio', { name: '사용함' }));
    expect(screen.getByLabelText('추가금 1')).toHaveValue('0');
    change('옵션명 1', '빨강'); change('추가금 1', '200'); change('옵션 재고 1', '2');
    fireEvent.click(screen.getByRole('button', { name: '옵션 추가' }));
    change('옵션명 2', '파랑'); change('옵션 재고 2', '3');
    expect(screen.getByLabelText('총재고')).toHaveValue('5'); expect(screen.getByLabelText('총재고')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: '상품 등록하기' })); fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await service.getProducts()).items[0]).toMatchObject({ price: 1000, stock: 5, category: '새 분류', options: [{ price: 200 }, { price: 0 }] });
    fireEvent.click(screen.getByRole('radio', { name: '사용함' })); fireEvent.click(screen.getByRole('button', { name: '옵션 1 삭제' }));
    expect(screen.getByRole('radio', { name: '사용안함' })).toBeChecked();
  });
  it('수정값을 채우고 순서와 수량을 유지하며 전체 상품으로 이동한다', async () => {
    const { service } = await ready({ form: true, id: 'landing-product-2', count: 3 });
    expect(screen.getByLabelText('상품명')).toHaveValue('무슨무슨가방');
    expect(screen.getByLabelText('가격')).toHaveValue('126,000');
    change('상품명', '이름 수정'); fireEvent.click(screen.getByRole('button', { name: '상품 수정하기' }));
    const dialog = await screen.findByRole('dialog', { name: '상품 수정 완료' });
    expect(dialog).toHaveTextContent('상품 수정이 완료되었습니다.');
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));
    expect(push).toHaveBeenCalledWith('/sales-management/v2/products');
    expect((await service.getProducts()).items[1].name).toBe('이름 수정'); expect((await service.getProducts()).total).toBe(3);
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });
  it('이미지 파일을 미리보고 저장하며 등록 하단 목록은 페이지로 나누지 않는다', async () => {
    const { service } = await ready({ form: true, count: 21 });
    expect(within(screen.getByRole('list', { name: '상품 목록' })).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByRole('navigation', { name: '페이지네이션' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('상품 이미지 선택'), { target: { files: [new File(['image'], 'sample.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByAltText('상품 이미지 미리보기')).toHaveAttribute('src', expect.stringContaining('data:image/png')));
    change('상품명', '이미지 상품'); change('가격', '1'); change('총재고', '1');
    fireEvent.click(screen.getByRole('button', { name: '상품 등록하기' })); fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await service.getProducts()).items[0].imageUrl).toContain('data:image/png');
  });
  it('처리 중 중복 등록을 막고 마지막 상품 삭제 시 빈 화면으로 전환한다', async () => {
    const { service } = await ready({ form: true, count: 0 });
    const originalSave = service.saveProduct;
    let release!: () => void;
    const saving = vi.spyOn(service, 'saveProduct').mockImplementation(async (...args) => {
      await new Promise<void>(resolve => { release = resolve; });
      return originalSave(...args);
    });
    change('상품명', '한 번만 등록'); change('가격', '0'); change('총재고', '0');
    fireEvent.click(screen.getByRole('button', { name: '상품 등록하기' }));
    const confirm = screen.getByRole('button', { name: '확인' });
    fireEvent.click(confirm); fireEvent.click(confirm); expect(confirm).toBeDisabled(); expect(saving).toHaveBeenCalledTimes(1);
    release(); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await service.getProducts()).total).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '한 번만 등록 삭제' })); fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await screen.findByText('아직 등록된 상품이 없습니다.'); expect((await service.getSellerSummary()).productCount).toBe(0);
  });
  it('수정 실패 시 입력과 저장된 데이터를 유지한다', async () => {
    const { service } = await ready({ form: true, id: 'landing-product-1', count: 1 });
    vi.spyOn(service, 'saveProduct').mockRejectedValueOnce(new Error('failure'));
    change('상품명', '수정 중인 이름'); fireEvent.click(screen.getByRole('button', { name: '상품 수정하기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('수정하지 못했어요.');
    expect(screen.getByLabelText('상품명')).toHaveValue('수정 중인 이름');
    expect((await service.getProducts()).items[0].name).toBe('무슨무슨가방'); expect(push).not.toHaveBeenCalled();
  });

  it.each([0, 1, 6, 7])('최근 상품은 등록 수 %i개에서 최대 6개를 표시한다', async count => {
    await ready({ form: true, count });
    const section = screen.getByRole('region', { name: '최근 등록된 상품' });
    expect(within(section).getByRole('heading', { name: '최근 등록된 상품' })).toBeInTheDocument();
    if (!count) expect(within(section).getByText('아직 등록된 상품이 없습니다.')).toBeInTheDocument();
    else expect(within(section).getAllByRole('listitem')).toHaveLength(Math.min(6, count));
  });
  it('최근 상품 삭제 후 다음 상품으로 6개를 채운다', async () => {
    const { service } = await ready({ form: true, count: 7 });
    const cards = () => screen.getAllByRole('listitem');
    fireEvent.click(within(cards()[0]).getByRole('button', { name: /삭제/ }));
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cards()).toHaveLength(6);
    expect(within(cards()[5]).getByRole('link')).toHaveAttribute('href', expect.stringContaining('landing-product-7/edit'));
    expect((await service.getProducts()).total).toBe(6);
  });
  it.each(['image/jpeg', 'image/png'])('%s 이미지와 최대 허용 용량을 처리하고 같은 파일을 재선택한다', async type => {
    await ready({ form: true, count: 0 });
    const input = screen.getByLabelText('상품 이미지 선택');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png');
    expect(input).toHaveAccessibleDescription('JPEG,PNG / 50MB 이하');
    const file = new File(['image'], 'sample', { type });
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 });
    for (let i = 0; i < 2; i++) {
      fireEvent.change(input, { target: { files: [file] } });
      await waitFor(() => expect(screen.getByAltText('상품 이미지 미리보기')).toHaveAttribute('src', expect.stringContaining(`data:${type}`)));
      expect(input).toHaveValue('');
      fireEvent.click(screen.getByRole('button', { name: '상품 이미지 삭제' }));
      expect(screen.queryByAltText('상품 이미지 미리보기')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '상품 이미지 삭제' })).not.toBeInTheDocument();
    }
  });
  it.each([['image/gif', 1], ['text/plain', 1], ['image/png', 50 * 1024 * 1024 + 1]])('허용하지 않는 파일 %s/%i는 토스트를 표시하고 기존 이미지를 유지한다', async (type, size) => {
    await ready({ form: true, id: 'landing-product-1', count: 1 });
    const src = screen.getByAltText('상품 이미지 미리보기').getAttribute('src');
    const file = new File(['image'], 'sample', { type });
    Object.defineProperty(file, 'size', { value: size });
    fireEvent.change(screen.getByLabelText('상품 이미지 선택'), { target: { files: [file] } });
    expect(screen.getByRole('alert')).toHaveTextContent('업로드 할 수 없는 파일입니다. 파일 형식이나 용량을 확인해주세요.');
    expect(screen.getByAltText('상품 이미지 미리보기')).toHaveAttribute('src', src);
    expect(screen.getByRole('button', { name: '상품 수정하기' })).toBeEnabled();
  });
  it('파일 읽기 실패 시 처리 잠금을 해제하고 기존 이미지를 유지한다', async () => {
    await ready({ form: true, id: 'landing-product-1', count: 1 });
    const src = screen.getByAltText('상품 이미지 미리보기').getAttribute('src');
    let reader!: FileReader;
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) { reader = this; });
    fireEvent.change(screen.getByLabelText('상품 이미지 선택'), { target: { files: [new File(['image'], 'sample.png', { type: 'image/png' })] } });
    expect(screen.getByRole('button', { name: '상품 이미지 등록' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '상품 이미지 삭제' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '상품 수정하기' })).toBeDisabled();
    act(() => reader.dispatchEvent(new ProgressEvent('error')));
    expect(await screen.findByRole('alert')).toHaveTextContent('이미지를 불러오지 못했어요. 다시 선택해주세요.');
    expect(screen.getByAltText('상품 이미지 미리보기')).toHaveAttribute('src', src);
    expect(screen.getByRole('button', { name: '상품 수정하기' })).toBeEnabled();
  });
  it('이미지 오류 토스트는 4초 후 닫힌다', async () => {
    await ready({ form: true, count: 0 });
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText('상품 이미지 선택'), { target: { files: [new File(['bad'], 'bad.gif', { type: 'image/gif' })] } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('이미지를 삭제한 수정값을 저장하고 Escape로 모달을 닫으면 목록으로 이동한다', async () => {
    const { service } = await ready({ form: true, id: 'landing-product-1', count: 1 });
    fireEvent.click(screen.getByRole('button', { name: '상품 이미지 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '상품 수정하기' }));
    const dialog = await screen.findByRole('dialog', { name: '상품 수정 완료' });
    expect((await service.getProducts()).items[0].imageUrl).toBeUndefined();
    expect(push).not.toHaveBeenCalled();
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
    expect(push).toHaveBeenCalledWith('/sales-management/v2/products');
  });
  it('수정 처리 중과 완료 모달 표시 중에 중복 제출을 막는다', async () => {
    const { service } = await ready({ form: true, id: 'landing-product-1', count: 1 });
    const original = service.saveProduct;
    let release!: () => void;
    const save = vi.spyOn(service, 'saveProduct').mockImplementation(async (...args) => {
      await new Promise<void>(resolve => { release = resolve; });
      return original(...args);
    });
    const button = screen.getByRole('button', { name: '상품 수정하기' });
    fireEvent.click(button); fireEvent.click(button);
    expect(button).toBeDisabled(); expect(save).toHaveBeenCalledTimes(1);
    release(); await screen.findByRole('dialog', { name: '상품 수정 완료' });
    fireEvent.submit(screen.getByRole('form', { name: '상품 수정' }));
    expect(save).toHaveBeenCalledTimes(1); expect(push).not.toHaveBeenCalled();
  });
  it.each([false, true])('저장 후 재조회 실패는 저장 실패와 구분한다 (edit=%s)', async edit => {
    const { service } = await ready({ form: true, count: 1, id: edit ? 'landing-product-1' : undefined });
    const save = vi.spyOn(service, 'saveProduct');
    vi.spyOn(service, 'getProducts').mockRejectedValueOnce(new Error('refresh failed'));
    change('상품명', '저장된 상품');
    if (!edit) { change('가격', '0'); change('총재고', '0'); }
    fireEvent.click(screen.getByRole('button', { name: edit ? '상품 수정하기' : '상품 등록하기' }));
    if (!edit) fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('상품은 저장되었지만 목록을 불러오지 못했어요.');
    expect(save).toHaveBeenCalledTimes(1);
    if (edit) expect(screen.getByRole('dialog', { name: '상품 수정 완료' })).toBeInTheDocument();
    else { expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByLabelText('상품명')).toHaveValue(''); }
    expect((await service.getProducts()).items[0].name).toBe('저장된 상품');
  });

  it('QA: 상품명을 지우고 숫자 이외 입력을 차단하며 등록 확인 문구와 대체 이미지를 표시한다', async () => {
    await ready({ form: true, count: 0 });
    change('상품명', '임시 상품');
    fireEvent.click(screen.getByRole('button', { name: '상품명 지우기' }));
    expect(screen.getByLabelText('상품명')).toHaveValue('');
    change('상품명', '이미지 없는 상품');
    change('가격', '1000');
    for (const value of ['-1', '1.5', '문자', '1e3']) {
      change('가격', value);
      expect(screen.getByLabelText('가격')).toHaveValue('1,000');
    }
    change('총재고', '1');
    fireEvent.click(screen.getByRole('button', { name: '상품 등록하기' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('상품 등록을 완료하시겠습니까?');
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('img', { name: '상품 이미지 없음' })).toBeInTheDocument();
  });
  it('QA: 카테고리는 8자까지 생성하고 초과값은 저장하지 않는다', async () => {
    const { service } = await ready({ form: true, count: 0 });
    fireEvent.focus(screen.getByLabelText('카테고리'));
    const input = screen.getByLabelText('카테고리 검색 및 생성');
    expect(input).toHaveAttribute('maxlength', '8');
    change('카테고리 검색 및 생성', '일이삼사오육칠팔구');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await service.getCategories()).not.toContain('일이삼사오육칠팔구');
    change('카테고리 검색 및 생성', '일이삼사오육칠팔');
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByRole('button', { name: '카테고리 해제' });
    expect(await service.getCategories()).toContain('일이삼사오육칠팔');
  });

});

it('API 이미지 업로드는 서버 URL을 보존하고 실패 시 이전 이미지를 유지한다', async () => {
  const service = { ...createMockLandingV2Service('store-only'), dataSource: 'api' as const };
  const upload = vi.spyOn(service, 'uploadProductImage').mockResolvedValueOnce('/api/v1/images/uploaded');
  render(<SalesManagementV2Provider service={service}><ProductsPage form /></SalesManagementV2Provider>);
  const image = await screen.findByLabelText('상품 이미지 선택');
  expect(image).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  expect(image).toHaveAccessibleDescription('JPEG,PNG,WebP / 10MB 이하');
  const file = new File(['image'], 'sample.webp', { type: 'image/webp' });
  fireEvent.change(image, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByAltText('상품 이미지 미리보기')).toHaveAttribute('src', '/api/v1/images/uploaded'));
  upload.mockRejectedValueOnce(new StoreApiError('UNAUTHORIZED', '로그인이 필요해요.', 401));
  fireEvent.change(image, { target: { files: [file] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('로그인이 필요해요.');
  expect(screen.getByAltText('상품 이미지 미리보기')).toHaveAttribute('src', '/api/v1/images/uploaded');
  change('상품명', '업로드 상품'); change('가격', '1'); change('총재고', '1');
  fireEvent.click(screen.getByRole('button', { name: '상품 등록하기' })); fireEvent.click(screen.getByRole('button', { name: '확인' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect((await service.getProducts()).items[0].imageUrl).toBe('/api/v1/images/uploaded');
});
it('조회 후 판매가 생긴 상품의 서버 삭제 거절을 표시하고 목록을 유지한다', async () => {
  const { service } = await ready({ count: 1 });
  vi.spyOn(service, 'deleteProduct').mockRejectedValueOnce(new StoreApiError('PRODUCT_HAS_SALES', '판매 이력이 있는 상품은 삭제할 수 없어요.', 409));
  fireEvent.click(screen.getByRole('button', { name: '무슨무슨가방 삭제' })); fireEvent.click(screen.getByRole('button', { name: '확인' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('판매 이력이 있는 상품은 삭제할 수 없어요.');
  expect((await service.getProducts()).total).toBe(1);
});
