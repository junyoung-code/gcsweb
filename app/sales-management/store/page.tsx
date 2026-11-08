import { SalesManagementPageShell } from '@/components/sales-management';
import StoreRegistrationForm from '@/components/sales-management/StoreRegistrationForm';

export default function StoreRegistrationPage() {
  return (
    <SalesManagementPageShell
      title="상점 등록하기"
      backHref="/sales-management"
      contentClassName="py-[49px] sm:py-[49px]"
    >
      <StoreRegistrationForm />
    </SalesManagementPageShell>
  );
}
