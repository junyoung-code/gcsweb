'use client';

import * as PortOne from '@portone/browser-sdk/v2';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function PayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);

  useEffect(() => {
    if (!orderId || triggered.current) return;

    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/v1/shop/orders/${orderId}/payment/portone`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;

      if (!res.ok || json?.status !== 'success') {
        setError(json?.message ?? '결제 정보를 불러올 수 없습니다.');
        return;
      }

      const data = json.data as {
        storeId: string;
        channelKey: string;
        paymentId: string;
        orderName: string;
        totalAmount: number;
        currency: string;
        payMethod: string;
        redirectUrl: string;
        buyerName: string;
        buyerTel?: string;
        buyerEmail?: string;
      };

      if (!data.storeId || !data.channelKey || !data.paymentId) {
        setError('결제 정보가 올바르지 않습니다.');
        return;
      }

      triggered.current = true;

      const redirectFull = `${data.redirectUrl}?orderId=${orderId}`;

      try {
        const response = await PortOne.requestPayment({
          storeId: data.storeId,
          channelKey: data.channelKey,
          paymentId: data.paymentId,
          orderName: data.orderName,
          totalAmount: data.totalAmount,
          currency: data.currency as 'CURRENCY_KRW',
          payMethod: data.payMethod as 'CARD',
          redirectUrl: redirectFull,
          forceRedirect: true,
          customer: {
            fullName: data.buyerName,
            ...(data.buyerTel ? { phoneNumber: data.buyerTel } : {}),
            ...(data.buyerEmail ? { email: data.buyerEmail } : {}),
          },
        });

        if (response?.code != null) {
          setError(response?.message ?? '결제 요청에 실패했습니다.');
          triggered.current = false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '결제창 호출에 실패했습니다.');
        triggered.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-[15px] text-neutral-9">{error}</p>
        <button
          type="button"
          className="rounded-[14px] bg-orange-5 px-5 py-3 text-[15px] font-semibold text-white"
          onClick={() => router.push('/QRshop/v1')}
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-[15px] text-neutral-8">결제창을 여는 중입니다…</p>
    </div>
  );
}

export default function QRshopPayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <p className="text-[15px] text-neutral-8">로딩 중…</p>
        </div>
      }
    >
      <PayContent />
    </Suspense>
  );
}
