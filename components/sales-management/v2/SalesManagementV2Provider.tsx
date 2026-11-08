'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import Link from 'next/link';
import PosProvider from './pos/PosProvider';
import { usePathname, useSearchParams } from 'next/navigation';
import { createStoreApiService } from '@/lib/services/sales-management-store-api-service';
import type { SalesManagementV2Service } from '@/lib/services/sales-management-service';
import { createMockLandingV2Service, parseLandingV2MockState } from '@/lib/mocks/sales-management-landing-v2-service';

const ServiceContext = createContext<SalesManagementV2Service | null>(null);

export default function SalesManagementV2Provider({ children, service }: { children: ReactNode; service?: SalesManagementV2Service }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Owned by the client layout: shared across v2 navigation, reset on a full reload.
  const [activeService] = useState(() => service ?? (process.env.NEXT_PUBLIC_SALES_MANAGEMENT_DATA_SOURCE === 'api' ? createStoreApiService() : createMockLandingV2Service(
    parseLandingV2MockState(searchParams.get('state') ?? undefined), { catalog: true },
  )));
  const ordersRoute = pathname === '/sales-management/v2/orders' || pathname?.startsWith('/sales-management/v2/orders/');
  if (activeService.dataSource === 'api' && (ordersRoute || pathname === '/sales-management/v2/pos' || pathname?.startsWith('/sales-management/v2/pos/'))) {
    return <main><p role="status">실제 주문 연동 전에는 {ordersRoute ? '전체 주문 조회' : '현장 포스'}를 이용할 수 없어요.</p><Link href="/sales-management/v2">판매 관리 홈으로</Link></main>;
  }
  return <ServiceContext.Provider value={activeService}>{activeService.dataSource === 'api' ? children : <PosProvider>{children}</PosProvider>}</ServiceContext.Provider>;
}

export function useSalesManagementV2Service() { return useContext(ServiceContext); }

export function useRequiredSalesManagementV2Service() {
  const service = useSalesManagementV2Service();
  if (!service) throw new Error('상품 관리 v2 Provider가 필요합니다.');
  return service;
}
