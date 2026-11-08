import {
  SalesManagementLanding,
  SalesManagementPageShell,
  salesManagementTabs,
} from '@/components/sales-management';

export default function SalesManagementLoading() {
  return (
    <SalesManagementPageShell
      title="판매 관리"
      tabs={salesManagementTabs}
      activeTabHref="/sales-management"
      contentClassName="py-0"
    >
      <SalesManagementLanding status="loading" />
    </SalesManagementPageShell>
  );
}
