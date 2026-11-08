'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/button/Button';
import { qrshopMockService } from '@/lib/mocks';
import { createQrshopApiService } from '@/lib/services/qrshop-api-service';
import { queuePaymentReturn } from '@/lib/qrshop/payment-session';
import { formatWon } from '@/lib/utils';
import type { QrshopOrderResult } from '@/types/qrshop';
import QrshopStateView from './QrshopStateView';

export default function QrshopResultClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const storeSlug = searchParams.get('storeSlug');
  const service = useMemo(() => storeSlug === null ? qrshopMockService : createQrshopApiService(storeSlug), [storeSlug]);
  const catalogUrl = storeSlug === null ? '/QRshop' : `/QRshop?storeSlug=${encodeURIComponent(storeSlug)}`;
  const [retry, setRetry] = useState(0);
  const [loadedService, setLoadedService] = useState<typeof service | null>(null);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<QrshopOrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrder(null); setError(null); setLoadedService(service); setLoadedOrderId(orderId);
    if (!orderId) { setError('주문 번호가 없습니다.'); return; }
    let cancelled = false;
    (service.verifyPayment ? service.verifyPayment(orderId) : service.getOrder(orderId)).then((result) => { if (!cancelled) setOrder(result); }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '주문 결과를 불러오지 못했습니다.'); });
    return () => { cancelled = true; };
  }, [orderId, service, retry]);

  if (loadedService !== service || loadedOrderId !== orderId) return <div role="status">주문 결과를 확인하는 중입니다.</div>;
  if (error) return <QrshopStateView title="주문 결과를 확인할 수 없습니다" description={error} actionLabel="다시 확인" onAction={() => setRetry(value => value + 1)} />;
  if (!order) return <div role="status" className="flex min-h-dvh items-center justify-center typo-body-small text-neutral-8">주문 결과를 확인하는 중입니다.</div>;

  if (order.failureCode === 'STOCK_SHORTAGE' || order.failureCode === 'REFUND_PENDING') {
    return (
      <main className="mx-auto flex h-dvh w-full max-w-[430px] flex-col px-4 pb-[max(51px,env(safe-area-inset-bottom))] pt-[67px]">
        <section className="flex shrink-0 flex-col items-center text-center">
          <span aria-hidden className="mb-5 h-10 w-10 bg-orange-5" style={{ mask: "url('/assets/icons/additional/icon-park-solid_caution.svg') center / contain no-repeat", WebkitMask: "url('/assets/icons/additional/icon-park-solid_caution.svg') center / contain no-repeat" }} />
          <h1 className="typo-body-small-bold text-neutral-12">해당 상품 품절로 전체 결제가 취소되었습니다.</h1>
          <p className="typo-body-small mt-[3px] text-neutral-9">{order.failureCode === 'REFUND_PENDING' ? '환불 확인이 필요합니다. 상점 직원에게 문의해주세요.' : '결제된 금액은 환불 예정입니다.'}</p>
        </section>
        <ul aria-label="품절 상품 목록" className="mt-[38px] min-h-0 flex-1 space-y-[10px] overflow-y-auto">
          {order.lines.filter(line => line.soldOut).map(line => (
            <li key={line.productId} className="min-h-[100px] rounded-lg bg-neutral-2 px-4 py-3 typo-body-xsmall">
              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 gap-y-2 break-words"><span className="text-neutral-10">상품명</span><strong className="font-semibold text-neutral-10">{line.productName}</strong><span className="text-neutral-8">옵션 / 수량</span><span className="text-neutral-8">{line.option ?? '옵션 없음'} / {line.quantity}개</span><span className="text-neutral-8">가격</span><span className="text-neutral-8">{formatWon(line.unitPrice)}</span></div>
            </li>
          ))}
        </ul>
        <Button className="mt-6 shrink-0" color="orange" onClick={() => router.push(catalogUrl)}>처음으로</Button>
      </main>
    );
  }

  if (order.status !== 'paid') {
    const title = order.status === 'pending' ? '결제가 완료되지 않았습니다.' : order.status === 'failed' ? '결제가 실패되었습니다.' : order.status === 'refund-pending' ? '환불 확인이 필요합니다.' : '결제가 취소되었습니다.';
    return <QrshopStateView icon={order.status === 'canceled' ? 'cart' : 'warning'} title={title} description={order.status === 'refund-pending' ? '상점 직원에게 주문 상태를 확인해주세요.' : undefined} actionLabel="처음으로" onAction={() => router.push(catalogUrl)} />;
  }

  const createdAt = new Date(order.createdAt);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][createdAt.getDay()];
  const date = `${createdAt.getFullYear()}.${String(createdAt.getMonth() + 1).padStart(2, '0')}.${String(createdAt.getDate()).padStart(2, '0')} ${weekday}`;
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden px-4 pb-[max(51px,env(safe-area-inset-bottom))] pt-20">
      <section className="shrink-0 flex flex-col items-center text-center">
        <h1 className="typo-heading-small text-black">결제가 완료되었습니다</h1>
        <p className="text-[55px] font-extrabold leading-[1.55] text-orange-5">{order.orderCode}</p>
        <p className="mt-[15px] w-full whitespace-nowrap rounded-[5px] border border-orange-4 bg-orange-1 px-3 py-[7px] typo-body-small-bold text-orange-10">카운터 직원에게 해당 화면을 보여주세요.</p>
      </section>
      <section aria-label="주문 내역" className="mt-[37px] flex min-h-0 flex-1 flex-col">
        <div className="flex h-[21px] items-center gap-2"><h2 className="typo-body-xsmall-bold text-black">주문내역</h2><span className="typo-body-xsmall text-neutral-7">{date}</span></div>
        <ul aria-label="완료 주문 상품 목록" className="mt-[10px] min-h-0 max-h-[343px] space-y-[10px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {order.lines.map((line) => (
            <li key={line.productId} className="min-h-[100px] rounded-lg bg-neutral-2 px-4 py-3 typo-body-xsmall">
              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 gap-y-2 break-words"><span className="text-neutral-10">상품명</span><strong className="font-semibold text-neutral-10">{line.productName}</strong><span className="text-neutral-8">옵션 / 수량</span><span className="text-neutral-8">{line.option ?? '옵션 없음'} / {line.quantity}개</span><span className="text-neutral-8">가격</span><span className="text-neutral-8">{formatWon(line.unitPrice)}</span></div>
            </li>
          ))}
        </ul>
      </section>
      <div role="group" aria-label="결제 결과 요약" className="mt-auto shrink-0">
        <div className="mb-[26px] flex items-center justify-between typo-body-small-bold"><span className="text-neutral-12">결제 금액</span><span className="text-orange-6">{formatWon(order.totalAmount)}</span></div>
        <Button className="h-[45px] rounded-[4px]" color="orange" onClick={() => {
          if (service.dataSource === 'api' && storeSlug && order.storeSlug === storeSlug) queuePaymentReturn(order.orderId, storeSlug);
          router.push(catalogUrl);
        }}>처음으로</Button>
      </div>
    </main>
  );
}
