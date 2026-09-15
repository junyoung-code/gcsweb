'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/button/Button';
import { qrshopMockService } from '@/lib/mocks';
import { formatWon } from '@/lib/utils';
import type { QrshopOrderResult, QrshopPaymentOutcome, QrshopPaymentState } from '@/types/qrshop';
import QrshopStateView from './QrshopStateView';

export default function QrshopPayClient() {
  const router = useRouter();
  const orderId = useSearchParams().get('orderId');
  const [order, setOrder] = useState<QrshopOrderResult | null>(null);
  const [paymentState, setPaymentState] = useState<QrshopPaymentState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) { setError('주문 번호가 없습니다.'); return; }
    let cancelled = false;
    qrshopMockService.getOrder(orderId).then((result) => {
      if (!cancelled) { setOrder(result); setPaymentState(result.status === 'failed' ? 'failed' : 'idle'); }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '주문 정보를 불러오지 못했습니다.');
    });
    return () => { cancelled = true; };
  }, [orderId]);

  const process = async (outcome: QrshopPaymentOutcome) => {
    if (!orderId || paymentState === 'processing') return;
    setPaymentState('processing'); setError(null);
    try {
      await qrshopMockService.processPayment(orderId, outcome);
      setPaymentState(outcome === 'success' ? 'succeeded' : 'failed');
      router.push(`/QRshop/v2/result?orderId=${encodeURIComponent(orderId)}`);
    } catch (reason) {
      setPaymentState('failed');
      setError(reason instanceof Error ? reason.message : '가짜 결제를 처리하지 못했습니다.');
    }
  };

  if (error && !order) return <QrshopStateView title="결제를 시작할 수 없습니다" description={error} actionLabel="상품 다시 고르기" onAction={() => router.push('/QRshop/v2')} />;
  if (!order) return <div role="status" className="flex min-h-dvh items-center justify-center typo-body-small text-neutral-8">주문 정보를 불러오는 중입니다.</div>;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-20">
      <div className="flex flex-col items-center text-center">
        <span className="rounded-full bg-orange-1 px-3 py-1 typo-body-xsmall-bold text-orange-7">Mock 결제</span>
        <h1 className="typo-heading-small mt-4 text-neutral-12">결제를 진행해 주세요</h1>
        <p className="typo-body-small mt-1 text-neutral-8">실제 결제나 카드 승인은 발생하지 않습니다.</p>
      </div>

      <section aria-label="결제할 주문" className="mt-8 rounded-lg bg-white p-4">
        <div className="flex items-center justify-between"><span className="typo-body-xsmall text-neutral-8">주문번호</span><strong className="typo-body-xsmall-bold text-neutral-12">{order.orderCode}</strong></div>
        <div className="mt-3 flex items-center justify-between"><span className="typo-body-xsmall text-neutral-8">결제 수단</span><strong className="typo-body-xsmall-bold text-neutral-12">{order.paymentMethod === 'online' ? '온라인 결제' : '현장 결제'}</strong></div>
        <div className="my-4 border-t border-dashed border-neutral-5" />
        <div className="flex items-center justify-between"><span className="typo-body-small-bold text-neutral-12">총 결제금액</span><strong className="typo-heading-xsmall text-orange-6">{formatWon(order.totalAmount)}</strong></div>
      </section>

      {paymentState === 'failed' || order.status === 'failed' ? <p role="alert" className="mt-4 rounded-lg bg-orange-1 p-3 typo-body-xsmall text-orange-10">{error ?? order.failureMessage ?? '결제에 실패했습니다. 다시 시도해 주세요.'}</p> : null}
      {paymentState === 'processing' ? <div role="status" className="mt-6 text-center typo-body-small text-neutral-8">가짜 결제 승인을 확인하는 중입니다…</div> : null}

      <div className="mt-auto space-y-2 pt-10">
        <Button color="orange" disabled={paymentState === 'processing'} onClick={() => void process('success')}>{paymentState === 'processing' ? '처리 중…' : order.status === 'failed' ? '결제 다시 시도' : '결제 완료하기'}</Button>
        <Button color="white" disabled={paymentState === 'processing'} onClick={() => void process('failure')}>결제 실패 상태 확인</Button>
        <button type="button" className="w-full py-2 typo-body-xsmall text-neutral-8" onClick={() => router.push('/QRshop/v2')}>상품 선택으로 돌아가기</button>
      </div>
    </main>
  );
}
