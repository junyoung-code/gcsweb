import type { ReactNode, MouseEvent } from 'react';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockPosService } from '@/lib/mocks/pos-service';
import type { PosProduct } from '@/lib/services/pos-service';
import PosProvider from './PosProvider';
import PosExposurePage from './PosExposurePage';
import PosPage from './PosPage';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
  <a {...props} href={href} onClick={(event: MouseEvent) => { event.preventDefault(); navigation.push(href); }}>{children}</a> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); navigation.push.mockReset(); });

function setup() {
  const products: PosProduct[] = [
    { id: 'a', name: '부산 엽서', category: '엽서', isVisible: true },
    { id: 'b', name: '서울 엽서', category: '엽서', isVisible: true },
    { id: 'c', name: '별 키링', category: '키링', isVisible: true },
    { id: 'd', name: '선물', category: '', isVisible: true },
    { id: 'e', name: '가죽 노트', category: '노트', isVisible: false, createdAt: '2026-03-12T00:00:00Z' },
    { id: 'f', name: '여행 노트', category: '노트', isVisible: false, createdAt: '2025-02-12T00:00:00Z' },
    { id: 'g', name: '새 키링', category: '키링', isVisible: false },
  ].map(product => ({ storeId: 'store', price: 3000, stock: 2, options: [], hasSalesHistory: false, ...product }));
  const source = { getProducts: async () => ({ items: products, total: products.length, newestProductId: null }), getCategories: async () => ['엽서', '키링', '노트'] };
  const service = createMockPosService(source);
  function Routes() {
    const [path, setPath] = useState('/sales-management/v2/pos/edit');
    navigation.push.mockImplementation(setPath);
    return path.endsWith('/edit') ? <PosExposurePage key="edit" mode="edit" />
      : path.endsWith('/add') ? <PosExposurePage key="add" mode="add" /> : <PosPage />;
  }
  render(<PosProvider service={service}><Routes /></PosProvider>);
  return { service, products };
}
const editReady = () => screen.findByRole('table', { name: '노출 상품 구성' });
const posNames = () => within(screen.getByRole('list', { name: 'POS 상품 목록' })).getAllByRole('button').map(button => button.textContent);

describe('POS 노출 편집/추가', () => {
  it('저장 전 변경을 취소하면 원복되고 저장하면 순서·숨김·제거가 POS와 재진입에 반영된다', async () => {
    const { service, products } = setup();
    await editReady();
    expect(screen.getByText('노출 상품 4개')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '키링 위로' }));
    fireEvent.click(screen.getByRole('button', { name: '부산 엽서 뒤로' }));
    fireEvent.click(screen.getByRole('button', { name: '키링 숨기기' }));
    fireEvent.click(screen.getByRole('button', { name: '서울 엽서 노출 제거' }));
    expect(screen.getByText('노출 상품 2개')).toBeInTheDocument();
    expect((await service.getCatalog()).map(product => product.id)).toEqual(['a', 'b', 'c', 'd']);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await screen.findByRole('list', { name: 'POS 상품 목록' });
    expect(posNames()).toEqual([expect.stringContaining('부산 엽서'), expect.stringContaining('서울 엽서'), expect.stringContaining('별 키링'), expect.stringContaining('선물')]);
    fireEvent.click(screen.getByRole('link', { name: '편집' }));
    await editReady();
    expect(screen.getByRole('button', { name: '키링 숨기기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '키링 위로' }));
    fireEvent.click(screen.getByRole('button', { name: '부산 엽서 뒤로' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('list', { name: 'POS 상품 목록' });
    expect((await service.getCatalog()).map(product => product.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(posNames()[0]).toContain('별 키링');
    fireEvent.click(screen.getByRole('link', { name: '편집' }));
    await editReady();
    const rows = within(screen.getByRole('table', { name: '노출 상품 구성' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('키링');
    expect(rows.at(-1)).toHaveTextContent('미분류');
    fireEvent.click(screen.getByRole('button', { name: '키링 숨기기' }));
    fireEvent.click(screen.getByRole('button', { name: '부산 엽서 노출 제거' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('list', { name: 'POS 상품 목록' });
    expect((await service.getCatalog()).map(product => product.id)).toEqual(['b', 'd']);
    expect(products[0].isVisible).toBe(true);
    expect(products[2].isVisible).toBe(true);
  });

  it('추가 필터·검색·전체선택·선택해제와 초안을 보존하며 최종 저장 후에만 POS에 노출한다', async () => {
    const { service } = setup();
    await editReady();
    fireEvent.click(screen.getByRole('button', { name: '부산 엽서 노출 제거' }));
    fireEvent.click(screen.getByRole('link', { name: '노출 상품 추가하기' }));
    await screen.findByRole('table', { name: '미노출 상품 목록' });
    expect(screen.getByText('미노출 상품 4개')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2026 1' }));
    expect(screen.getByRole('checkbox', { name: '가죽 노트 선택' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '여행 노트 선택' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: '현재 목록 전체 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '전체 4' }));
    fireEvent.change(screen.getByRole('combobox', { name: '상품 카테고리' }), { target: { value: '키링' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '새 키링 선택' }));
    expect(screen.getByText('2개 선택')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }));
    expect(screen.getByRole('button', { name: '노출 상품으로 이동' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: '상품 카테고리' }), { target: { value: 'all' } });
    fireEvent.change(screen.getByRole('searchbox', { name: '상품 검색' }), { target: { value: '없는 상품' } });
    expect(screen.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: '상품 검색' }), { target: { value: '가죽' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '가죽 노트 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '노출 상품으로 이동' }));
    await editReady();
    expect(screen.queryByRole('button', { name: '부산 엽서 노출 제거' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가죽 노트 노출 제거' })).toBeInTheDocument();
    expect((await service.getCatalog()).map(product => product.id)).toEqual(['a', 'b', 'c', 'd']);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('list', { name: 'POS 상품 목록' });
    expect((await service.getCatalog()).map(product => product.id)).toEqual(['b', 'c', 'e', 'd']);
    expect(screen.getByRole('button', { name: '가죽 노트, 재고 2개' })).toBeInTheDocument();
  });

  it('조회 실패 재시도와 저장 실패시 초안 보존·중복 저장 방지를 제공한다', async () => {
    const { service } = setup();
    // The first load is already in flight; fail the next route entry.
    await editReady();
    fireEvent.click(screen.getByRole('button', { name: '부산 엽서 노출 제거' }));
    let reject!: (reason: Error) => void;
    const save = vi.spyOn(service, 'saveExposure').mockImplementationOnce(() => new Promise((_, rejectSave) => { reject = rejectSave; }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    fireEvent.click(screen.getByRole('button', { name: '저장 중' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    await act(async () => reject(new Error('저장 실패')));
    expect(await screen.findByRole('alert')).toHaveTextContent('저장 실패');
    expect(screen.queryByRole('button', { name: '부산 엽서 노출 제거' })).not.toBeInTheDocument();
    vi.spyOn(service, 'getExposureProducts').mockRejectedValueOnce(new Error('조회 실패'));
    fireEvent.click(screen.getByRole('link', { name: '노출 상품 추가하기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await screen.findByRole('table', { name: '미노출 상품 목록' });
    fireEvent.click(screen.getByRole('link', { name: '포스 노출 상품 목록 보기' }));
    await editReady();
    expect(screen.queryByRole('button', { name: '부산 엽서 노출 제거' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
  });
});
