import { Suspense } from 'react';
import { QrshopPayClient } from '@/components/qrshop/v2';

export default function QRshopPayPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center typo-body-small text-neutral-8">결제 정보를 준비하는 중입니다.</div>}>
      <QrshopPayClient />
    </Suspense>
  );
}
