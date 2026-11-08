import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createStoreApiService } from '@/lib/services/sales-management-store-api-service';
import { createMockLandingV2Service } from '@/lib/mocks/sales-management-landing-v2-service';
import SalesManagementV2Provider from './SalesManagementV2Provider';
import { usePosSession } from './pos/PosProvider';
import type { PosStaffService } from '@/lib/services/pos-staff-service';

const route = vi.hoisted(() => ({ pathname: '/sales-management/v2/pos' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname, useSearchParams: () => new URLSearchParams() }));
afterEach(cleanup);
it.each(['/sales-management/v2/pos', '/sales-management/v2/pos/edit', '/sales-management/v2/pos/add', '/sales-management/v2/orders', '/sales-management/v2/orders/detail'])('API 모드의 %s 직접 진입은 Mock 운영 화면을 마운트하지 않는다', pathname => {
  route.pathname = pathname;
  render(<SalesManagementV2Provider service={createStoreApiService()}><p>POS 판매 화면</p></SalesManagementV2Provider>);
  expect(screen.queryByText('POS 판매 화면')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('실제 주문 연동 전에는');
  expect(screen.getByRole('link')).toHaveAttribute('href', '/sales-management/v2');
});
it('Mock 모드 POS는 기존대로 열린다', () => {
  route.pathname = '/sales-management/v2/pos';
  render(<SalesManagementV2Provider service={createMockLandingV2Service()}><p>POS 판매 화면</p></SalesManagementV2Provider>);
  expect(screen.getByText('POS 판매 화면')).toBeInTheDocument();
});

it('Mock POS와 주문조회 이동 시 같은 직원 Service를 유지한다', async () => {
  const service = createMockLandingV2Service();
  let staff: PosStaffService | undefined;
  function Probe() { staff = usePosSession()?.staffService; return <p>운영 화면</p>; }
  route.pathname = '/sales-management/v2/pos';
  const view = render(<SalesManagementV2Provider service={service}><Probe /></SalesManagementV2Provider>);
  const original = staff!;
  const before = await original.getStaff();
  await original.approve(before.pending[0].id);
  route.pathname = '/sales-management/v2/orders';
  view.rerender(<SalesManagementV2Provider service={service}><Probe /></SalesManagementV2Provider>);
  expect(staff).toBe(original);
  expect((await staff!.getStaff()).pending).toHaveLength(before.pending.length - 1);
});
