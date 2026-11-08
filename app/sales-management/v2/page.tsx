import SalesManagementLandingV2 from '@/components/sales-management/v2/SalesManagementLandingV2';
import { parseLandingV2MockState } from '@/lib/mocks/sales-management-landing-v2-service';

export default function SalesManagementV2Page({ searchParams }: { searchParams?: { state?: string } }) {
  return <SalesManagementLandingV2 key={searchParams?.state} mockState={parseLandingV2MockState(searchParams?.state)} />;
}
