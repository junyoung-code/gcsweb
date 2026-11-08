import { ProductRegistrationForm, SalesManagementPageShell } from '@/components/sales-management';

export default function ProductsPage() {
  return <SalesManagementPageShell title="상품 등록하기" backHref="/sales-management"><ProductRegistrationForm /></SalesManagementPageShell>;
}
