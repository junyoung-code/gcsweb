import { Suspense } from 'react';
import { QrshopResultClient } from '@/components/qrshop/v2';

export default function QRshopResultPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center typo-body-small text-neutral-8">주문 결과를 확인하는 중입니다.</div>}>
      <QrshopResultClient />
    </Suspense>
  );
}
