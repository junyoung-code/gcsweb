import { Suspense } from 'react';
import { QrshopOrderClient } from '@/components/qrshop/v2';

export default function QRshopPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center typo-body-small text-neutral-8">상품을 불러오는 중입니다.</div>}>
      <QrshopOrderClient />
    </Suspense>
  );
}
