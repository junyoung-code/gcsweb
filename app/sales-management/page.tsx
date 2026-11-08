import {
  SalesManagementLanding,
  SalesManagementPageShell,
  salesManagementTabs,
} from '@/components/sales-management';
import {
  createMockSalesManagementLandingService,
  MockServiceError,
  type SalesManagementLandingMockState,
} from '@/lib/mocks';

interface SalesManagementPageProps {
  searchParams?: { state?: string };
}

function getMockState(state?: string): SalesManagementLandingMockState {
  if (state === 'empty' || state === 'error' || state === 'loading') return state;
  return 'success';
}

export default async function SalesManagementPage({
  searchParams,
}: SalesManagementPageProps) {
  const service = createMockSalesManagementLandingService(
    getMockState(searchParams?.state),
  );

  let content: React.ReactNode;

  try {
    const summary = await service.getSellerSummary();
    content = <SalesManagementLanding status="ready" summary={summary} />;
  } catch (error) {
    const errorMessage =
      error instanceof MockServiceError ? error.message : undefined;
    content = <SalesManagementLanding status="error" errorMessage={errorMessage} />;
  }

  return (
    <SalesManagementPageShell
      title="판매 관리"
      tabs={salesManagementTabs}
      activeTabHref="/sales-management"
      contentClassName="py-0"
    >
      {content}
    </SalesManagementPageShell>
  );
}
