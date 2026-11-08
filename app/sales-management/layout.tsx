import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '판매 관리 | GCS',
  description: '상점, 상품, 주문과 재고를 관리합니다.',
  robots: { index: false, follow: false },
};

export default function SalesManagementLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
