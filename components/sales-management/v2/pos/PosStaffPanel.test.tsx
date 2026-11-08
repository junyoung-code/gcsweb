import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockPosStaffService } from '@/lib/mocks/pos-staff-service';
import { createMockPosService } from '@/lib/mocks/pos-service';
import type { PosStaffSnapshot } from '@/lib/services/pos-staff-service';
import PosProvider from './PosProvider';
import PosHeader from './PosHeader';
import PosStaffPanel, { staffDate } from './PosStaffPanel';

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const initial: PosStaffSnapshot = {
  inviteUrl: 'https://example.invalid/mock/staff',
  pending: [{ id: 'p1', name: '정서윤', requestedAt: '2026-11-07T10:21:00+09:00' }, { id: 'p2', name: '이서준', requestedAt: '2026-11-04T10:00:00+09:00' }],
  registered: [{ id: 'r1', name: '김민수', requestedAt: '2026-09-01T10:00:00+09:00', registeredAt: '2026-09-02T10:00:00+09:00' }],
};
const trigger = () => screen.getByRole('button', { name: '직원 관리' });
const panel = () => screen.getByRole('dialog', { name: '직원 관리' });
const click = (name: string) => fireEvent.click(within(panel()).getByRole('button', { name }));
async function ready(service = createMockPosStaffService(initial)) {
  render(<PosStaffPanel service={service} />);
  await screen.findByLabelText('승인 대기 2명');
  fireEvent.click(trigger());
  return service;
}

describe('POS 직원 관리 패널', () => {
  it('헤더에서 열고 닫기·Escape 취소 시 포커스를 돌려준다', async () => {
    render(<PosHeader initialHelp={false} />);
    await screen.findByLabelText('승인 대기 2명');
    trigger().focus(); fireEvent.click(trigger());
    expect(panel()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    click('직원 관리 닫기');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    fireEvent.click(trigger());
    // Native Escape dispatches cancel on a modal dialog.
    fireEvent(panel(), new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('데이터 인원수로 배지와 목록을 갱신하고 빈 상태·재진입을 지원한다', async () => {
    await ready();
    expect(within(panel()).getByRole('heading', { name: '등록된 직원 (1)' })).toBeInTheDocument();
    click('정서윤 승인');
    await screen.findByLabelText('승인 대기 1명');
    expect(within(panel()).getByRole('heading', { name: '등록된 직원 (2)' })).toBeInTheDocument();
    click('이서준 거절');
    await screen.findByText('승인 대기 중인 직원이 없습니다.');
    expect(screen.queryByLabelText(/승인 대기 \d명/)).not.toBeInTheDocument();
    click('김민수 삭제');
    await waitFor(() => expect(within(panel()).queryByText('김민수')).not.toBeInTheDocument());
    click('정서윤 삭제');
    await screen.findByText('등록된 직원이 없습니다.');
    click('직원 관리 닫기'); fireEvent.click(trigger());
    expect(within(panel()).getByText('승인 대기 중인 직원이 없습니다.')).toBeInTheDocument();
    expect(within(panel()).getByText('등록된 직원이 없습니다.')).toBeInTheDocument();
  });

  it.each(['approve', 'reject', 'remove'] as const)('%s 중복 실행을 막고 실패 시 목록/배지를 보존하여 재시도한다', async action => {
    const service = createMockPosStaffService(initial);
    let reject!: (error: Error) => void;
    const request = vi.spyOn(service, action).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await ready(service);
    const name = action === 'remove' ? '김민수 삭제' : action === 'approve' ? '정서윤 승인' : '정서윤 거절';
    click(name); click(name);
    expect(request).toHaveBeenCalledTimes(1);
    expect(within(panel()).getByRole('button', { name: '이서준 승인' })).toBeDisabled();
    expect(within(panel()).getByRole('status')).toHaveTextContent('처리하는 중');
    await act(async () => reject(new Error('실패')));
    expect(await screen.findByRole('alert')).toHaveTextContent('기존 목록을 유지');
    expect(screen.getByLabelText('승인 대기 2명')).toBeInTheDocument();
    expect(within(panel()).getByRole('list', { name: '승인 대기 목록' }).children).toHaveLength(2);
    expect(within(panel()).getByRole('list', { name: '등록된 직원 목록' }).children).toHaveLength(1);
    click('다시 시도');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(request).toHaveBeenCalledTimes(2);
    expect((await service.getStaff())[action === 'remove' ? 'registered' : 'pending']).toHaveLength(action === 'remove' ? 0 : 1);
  });

  it('조회 로딩·실패·재시도 상태에서 알 수 없는 인원수를 0으로 표시하지 않는다', async () => {
    const service = createMockPosStaffService(initial);
    vi.spyOn(service, 'getStaff').mockRejectedValueOnce(new Error('조회 실패'));
    render(<PosStaffPanel service={service} />);
    fireEvent.click(trigger());
    expect(within(panel()).getByRole('status')).toHaveTextContent('불러오는 중');
    expect(within(panel()).getByRole('button', { name: 'Mock 직원 초대 링크 복사' })).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent('불러오지 못했어요');
    expect(screen.queryByLabelText(/승인 대기 \d명/)).not.toBeInTheDocument();
    click('다시 불러오기');
    await screen.findByLabelText('승인 대기 2명');
    expect(within(panel()).getByRole('heading', { name: '승인 대기 (2)' })).toBeInTheDocument();
  });

  it.each([true, false])('Mock 링크 복사의 성공(%s)·실패를 알리고 재시도한다', async success => {
    const writeText = vi.fn().mockImplementationOnce(() => success ? Promise.resolve() : Promise.reject(new Error('권한 없음'))).mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await ready();
    click('Mock 직원 초대 링크 복사');
    expect(await screen.findByRole('status')).toHaveTextContent(success ? '실제 직원 초대에는 사용할 수 없습니다.' : '직접 선택해 복사');
    expect(writeText).toHaveBeenCalledWith(initial.inviteUrl);
    click('Mock 직원 초대 링크 복사');
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('status')).toHaveTextContent('Mock 초대 링크를 복사');
    expect(screen.getByLabelText('직원 초대 링크')).toHaveAttribute('readonly');
  });

  it('POS Provider 안에서 헤더가 재생성되어도 Mock 변경을 유지한다', async () => {
    const posService = createMockPosService({ getProducts: async () => ({ items: [], total: 0, newestProductId: null }) });
    function Route() {
      const [key, setKey] = useState(0);
      return <><button onClick={() => setKey(key + 1)}>헤더 재진입</button><PosHeader key={key} initialHelp={false} /></>;
    }
    render(<PosProvider service={posService} staffService={createMockPosStaffService(initial)}><Route /></PosProvider>);
    await screen.findByLabelText('승인 대기 2명');
    fireEvent.click(trigger()); click('정서윤 승인');
    await screen.findByLabelText('승인 대기 1명');
    click('직원 관리 닫기');
    fireEvent.click(screen.getByRole('button', { name: '헤더 재진입' }));
    await screen.findByLabelText('승인 대기 1명');
    fireEvent.click(trigger());
    expect(within(panel()).getByRole('heading', { name: '등록된 직원 (2)' })).toBeInTheDocument();
  });

  it('한국 시간 기준 당일 요청은 시간, 이전 요청과 등록일은 데이터 날짜로 표시한다', () => {
    const now = new Date('2026-11-07T02:00:00Z');
    expect(staffDate(initial.pending[0], false, now)).toBe('10:21 등록 요청');
    expect(staffDate(initial.pending[1], false, now)).toBe('2026.11.04 등록 요청');
    expect(staffDate(initial.registered[0], true, now)).toBe('등록일 2026.09.02');
    expect(staffDate({ ...initial.pending[0], requestedAt: 'invalid' }, false, now)).toBe('요청일 정보 없음');
  });
});
