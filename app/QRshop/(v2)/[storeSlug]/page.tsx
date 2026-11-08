import { Suspense } from 'react';
import { QrshopOrderClient } from '@/components/qrshop/v2';

export default function QrshopStorePage({ params }: { params: { storeSlug: string } }) {
  // Next may preserve the URL prefix as %40; the API expects the raw slug.
  const storeSlug = params.storeSlug.replace(/^(?:@|%40)/, '');
  return (
    <Suspense fallback={<div role="status">상품을 불러오는 중입니다.</div>}>
      <QrshopOrderClient storeSlug={storeSlug} />
    </Suspense>
  );
}
