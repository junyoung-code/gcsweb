import { Suspense, type ReactNode } from 'react';
import SalesManagementV2Provider from '@/components/sales-management/v2/SalesManagementV2Provider';

export default function SalesManagementV2Layout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p role="status">불러오는 중입니다.</p>}>
    <SalesManagementV2Provider>{children}</SalesManagementV2Provider>
  </Suspense>;
}
