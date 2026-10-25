'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NavBar } from '@/components/layout';
import { Button, EmptyviewText, Productcard } from '@/components/ui';

type OrderResultItem = {
  id: string;
  productName: string;
  teamName: string;
  optionText: string;
  priceText: string;
  thumbnailUrl: string;
  receiptLabel: string;
};

type OrderResultData = {
  orderCode: string;
  items: OrderResultItem[];
};

const GUEST_TOKEN_STORAGE_KEY = 'shop:guest-token';

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') ?? searchParams.get('paymentId');
  const isCounterPay = searchParams.get('counterPay') === '1';
  const portoneCode = searchParams.get('code');
  const portoneMessage = searchParams.get('message');

  const [status, setStatus] = useState<'loading' | 'success' | 'fail'>('loading');
  const [message, setMessage] = useState('');
  const [orderResult, setOrderResult] = useState<OrderResultData | null>(null);

  useEffect(() => {
    if (!orderId) {
      setStatus('fail');
      setMessage('주문 정보를 확인할 수 없습니다.');
      return;
    }

    if (isCounterPay) {
      setStatus('success');
      return;
    }

    if (portoneCode != null) {
      setStatus('fail');
      setMessage(portoneMessage ?? '결제가 완료되지 않았습니다.');
      return;
    }

    let cancelled = false;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    (async () => {
      let lastMessage = '결제가 완료되지 않았습니다.';

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res = await fetch(`/api/v1/shop/orders/${orderId}/payment/portone/verify`, {
          method: 'POST',
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        const verified = json?.data?.verified === true;
        if (verified) {
          setStatus('success');
          return;
        }

        lastMessage = json?.data?.message ?? lastMessage;
        if (attempt < 2) {
          await delay(1200);
        }
      }

      if (cancelled) return;
      setStatus('fail');
      setMessage(lastMessage);
    })();

    return () => {
      cancelled = true;
    };
  }, [isCounterPay, orderId, portoneCode, portoneMessage]);

  useEffect(() => {
    if (status !== 'success' || !orderId) return;

    let cancelled = false;

    (async () => {
      const guestToken =
        typeof window !== 'undefined' ? window.localStorage.getItem(GUEST_TOKEN_STORAGE_KEY)?.trim() ?? '' : '';

      const res = await fetch(`/api/v1/shop/orders/${orderId}`, {
        cache: 'no-store',
        headers: guestToken ? { 'x-guest-token': guestToken } : {},
      });
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;

      if (!res.ok || json?.status !== 'success') {
        setOrderResult({ orderCode: '', items: [] });
        return;
      }

      const order = json?.data?.order ?? {};
      const orderCode = typeof order?.orderCode === 'string' ? order.orderCode : '';
      const items = Array.isArray(order?.items) ? order.items : [];

      setOrderResult({
        orderCode,
        items: items.map((item: any) => ({
          id: String(item?.id ?? ''),
          productName: String(item?.productName ?? '상품'),
          teamName: String(item?.teamName ?? ''),
          optionText: String(item?.optionText ?? ''),
          priceText: String(item?.priceText ?? ''),
          thumbnailUrl: String(item?.thumbnailUrl ?? ''),
          receiptLabel: String(item?.receiptLabel ?? '미수령'),
        })),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, status]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-[calc(100vh-78px)] items-center justify-center bg-neutral-3 px-5">
        <p className="typo-body-small text-neutral-9">결제 결과를 확인 중입니다.</p>
      </div>
    );
  }

  if (status === 'success') {
    const orderCodeText = orderResult?.orderCode ? `주문번호 ${orderResult.orderCode}` : '주문번호 확인 중';
    const items = orderResult?.items ?? [];

    return (
      <div className="min-h-screen bg-neutral-3">
        <NavBar variant="title-back" title="주문하기" onBack={() => router.push('/shop')} />

        <div className="mx-auto flex w-full max-w-[375px] flex-col gap-5 px-4 py-5">
          <section className="flex w-full flex-col items-center justify-center p-3 text-center">
            <p className="text-[19px] font-bold leading-[1.5] text-orange-5">{orderCodeText}</p>
            <p className="typo-body-small text-neutral-8">주문번호 확인을 위해 스크린샷을 남겨주세요!</p>
          </section>

          <section className="flex w-full flex-col gap-3">
            <h2 className="typo-body-small-bold text-neutral-10">주문한 상품</h2>

            <div className="flex flex-col gap-5">
              {items.map((item) => (
                <article key={item.id} className="rounded-lg border border-neutral-4 bg-neutral-2 px-[18px] pb-4 pt-3">
                  <div className="flex flex-col gap-[14px]">
                    <div className="flex h-7 items-center border-b border-dashed border-neutral-5">
                      <p className="typo-body-xsmall text-neutral-8">{item.receiptLabel || '미수령'}</p>
                    </div>

                    <Productcard
                      type="all"
                      view="cart"
                      className="w-full"
                      imageSrc={item.thumbnailUrl}
                      brand={item.teamName || '팀명'}
                      title={item.productName}
                      cartOptionText={item.optionText}
                      cartTags={['Buy Now', '현장수령']}
                      cartPriceText={item.priceText}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // status === 'fail'
  // orderId(또는 paymentId)가 없는 경우, 포트원에서 결제 실패 후 돌아온 경우, 결제 검증 3회 모두 실패한 경우
  return (
    <div className="min-h-[calc(100vh-78px)] bg-neutral-3">
      <NavBar variant="title-back" title="주문하기" onBack={() => router.push('/shop')} />
      <div className="mx-auto flex w-full max-w-[375px] flex-col items-center gap-4 px-5 pb-[220px] pt-[220px] text-center">
        <EmptyviewText title="결제에 실패했습니다." subtitle={message} />
        <Button size="m" color="orange" className="h-[47px] w-[182px]" onClick={() => router.push('/shop')}>
          홈으로 이동
        </Button>
      </div>
    </div>
  );
}

export default function BuyNowResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-3 px-5">
          <p className="typo-body-small text-neutral-9">결과를 확인 중입니다.</p>
        </div>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
