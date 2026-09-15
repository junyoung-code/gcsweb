'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/button/Button';
import { qrshopMockService } from '@/lib/mocks';
import { formatWon } from '@/lib/utils';
import type { QrshopOrderResult } from '@/types/qrshop';
import QrshopStateView from './QrshopStateView';

export default function QrshopResultClient() {
  const router = useRouter();
  const orderId = useSearchParams().get('orderId');
  const [order, setOrder] = useState<QrshopOrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) { setError('주문 번호가 없습니다.'); return; }
    let cancelled = false;
    qrshopMockService.getOrder(orderId).then((result) => { if (!cancelled) setOrder(result); }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '주문 결과를 불러오지 못했습니다.'); });
    return () => { cancelled = true; };
  }, [orderId]);

  if (error) return <QrshopStateView title="주문 결과를 확인할 수 없습니다" description={error} actionLabel="처음으로" onAction={() => router.push('/QRshop/v2')} />;
  if (!order) return <div role="status" className="flex min-h-dvh items-center justify-center typo-body-small text-neutral-8">주문 결과를 확인하는 중입니다.</div>;

  if (order.status === 'failed') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center px-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-1 text-3xl text-orange-6">!</div>
        <h1 className="typo-heading-small mt-5 text-neutral-12">결제에 실패했습니다</h1>
        <p className="typo-body-small mt-2 text-neutral-8">{order.failureMessage ?? '결제를 완료하지 못했습니다.'}</p>
        <div className="mt-8 w-full max-w-[343px] space-y-2">
          <Button color="orange" onClick={() => router.push(`/QRshop/v2/pay?orderId=${encodeURIComponent(order.orderId)}`)}>결제 다시 시도</Button>
          <Button color="white" onClick={() => router.push('/QRshop/v2')}>상품 다시 고르기</Button>
        </div>
      </main>
    );
  }

  if (order.status === 'pending') {
    return <QrshopStateView title="아직 결제가 끝나지 않았습니다" description="결제 화면에서 가짜 결제를 완료해 주세요." actionLabel="결제 화면으로" onAction={() => router.push(`/QRshop/v2/pay?orderId=${encodeURIComponent(order.orderId)}`)} />;
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
            <li key={line.productId} className="h-[100px] rounded-lg bg-neutral-2 px-4 py-3 typo-body-xsmall">
              <div className="grid grid-cols-[64px_1fr] gap-x-4 gap-y-2"><span className="text-neutral-10">상품명</span><strong className="font-semibold text-neutral-10">{line.productName}</strong><span className="text-neutral-8">옵션 / 수량</span><span className="text-neutral-8">{line.option ?? '옵션 없음'} / {line.quantity}개</span><span className="text-neutral-8">가격</span><span className="text-neutral-8">{formatWon(line.unitPrice)}</span></div>
            </li>
          ))}
        </ul>
      </section>
      <div role="group" aria-label="결제 결과 요약" className="mt-auto shrink-0">
        <div className="mb-[26px] flex items-center justify-between typo-body-small-bold"><span className="text-neutral-12">결제 금액</span><span className="text-orange-6">{formatWon(order.totalAmount)}</span></div>
        <Button className="h-[45px] rounded-[4px]" color="orange" onClick={() => router.push('/QRshop/v2')}>처음으로</Button>
      </div>
    </main>
  );
}
