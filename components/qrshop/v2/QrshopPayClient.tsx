'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { emptyQrshopBuyer, getQrshopBuyer, type QrshopBuyer } from '@/lib/qrshop/buyer-profile';
import Button from '@/components/ui/button/Button';
import { qrshopMockService } from '@/lib/mocks';
import { createQrshopApiService } from '@/lib/services/qrshop-api-service';
import { formatWon } from '@/lib/utils';
import type { QrshopOrderResult, QrshopPaymentOutcome, QrshopPaymentState } from '@/types/qrshop';
import QrshopStateView from './QrshopStateView';

export default function QrshopPayClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const orderId = searchParams.get('orderId');
  const storeSlug = searchParams.get('storeSlug');
  const service = useMemo(() => storeSlug === null ? qrshopMockService : createQrshopApiService(storeSlug), [storeSlug]);
  const catalogUrl = storeSlug === null ? '/QRshop' : `/QRshop?storeSlug=${encodeURIComponent(storeSlug)}`;
  const resultUrl = `/QRshop/result?orderId=${encodeURIComponent(orderId ?? '')}${storeSlug === null ? '' : `&storeSlug=${encodeURIComponent(storeSlug)}`}`;
  const inFlight = useRef(false);
  const activePayment = useRef<AbortController | null>(null);
  const [checking, setChecking] = useState(false);
  const [buyerEmail, setBuyerEmail] = useState('');
  const emailInput = useRef<HTMLInputElement>(null);
  const [buyerPhone, setBuyerPhone] = useState('');
  const phoneInput = useRef<HTMLInputElement>(null);
  const [buyerName, setBuyerName] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const [retry, setRetry] = useState(0);
  const profileKey = `${storeSlug}:${sessionStatus}:${session?.user?.id ?? ''}`;
  const [loadedProfileKey, setLoadedProfileKey] = useState<string | null>(null);
  const [memberBuyer, setMemberBuyer] = useState<QrshopBuyer>(emptyQrshopBuyer);
  const [profileError, setProfileError] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const profileReady = service.dataSource !== 'api' || (sessionStatus !== 'loading' && loadedProfileKey === profileKey);
  const completeProfile = Boolean(memberBuyer.email && memberBuyer.phone && memberBuyer.name);

  useEffect(() => {
    if (service.dataSource !== 'api' || sessionStatus === 'loading') return;
    const controller = new AbortController();
    let cancelled = false;
    setLoadedProfileKey(null); setProfileError(null); setMemberBuyer(emptyQrshopBuyer);
    setBuyerEmail(''); setBuyerPhone(''); setBuyerName(''); autoStarted.current = false;
    const profile = sessionStatus === 'authenticated' ? getQrshopBuyer(controller.signal) : Promise.resolve({ ...emptyQrshopBuyer });
    profile.then(buyer => {
      if (cancelled) return;
      setMemberBuyer(buyer); setBuyerEmail(buyer.email); setBuyerPhone(buyer.phone); setBuyerName(buyer.name);
      setLoadedProfileKey(profileKey);
    }).catch(() => {
      if (!cancelled) { setProfileError('회원정보를 불러오지 못했습니다. 다시 확인해주세요.'); setLoadedProfileKey(profileKey); }
    });
    return () => { cancelled = true; controller.abort(); };
  }, [profileKey, service, sessionStatus, retry]);
  const [loadedService, setLoadedService] = useState<typeof service | null>(null);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<QrshopOrderResult | null>(null);
  const [paymentState, setPaymentState] = useState<QrshopPaymentState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    activePayment.current = controller;
    inFlight.current = false;
    setOrder(null); setError(null); setPaymentState('idle'); setChecking(false); autoStarted.current = false;
    setLoadedService(service); setLoadedOrderId(orderId);
    if (!orderId) { setError('주문 번호가 없습니다.'); return () => controller.abort(); }
    let cancelled = false;
    service.getOrder(orderId).then((result) => {
      if (!cancelled) { setOrder(result); setPaymentState(result.status === 'failed' ? 'failed' : 'idle'); }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '주문 정보를 불러오지 못했습니다.');
    });
    return () => { cancelled = true; controller.abort(); };
  }, [orderId, service, retry, profileKey]);

  useEffect(() => {
    if (paymentState !== 'processing') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [paymentState]);

  const process = useCallback(async (outcome: QrshopPaymentOutcome) => {
    const controller = activePayment.current;
    if (!orderId || inFlight.current || !controller || controller.signal.aborted) return;
    if (!profileReady || profileError) return;
    if (service.dataSource === 'api' && !checking && (
      (!memberBuyer.email && !emailInput.current?.reportValidity()) ||
      (!memberBuyer.phone && !phoneInput.current?.reportValidity()) ||
      (!memberBuyer.name && !nameInput.current?.reportValidity()))) return;
    inFlight.current = true;
    setPaymentState('processing'); setError(null);
    try {
      if (service.startPayment && service.verifyPayment) {
        const result = await (checking ? service.verifyPayment(orderId) : service.startPayment(orderId, controller.signal, buyerEmail, buyerPhone, buyerName));
        if (controller.signal.aborted) return;
        setOrder(result); setChecking(false);
      } else {
        await service.processPayment(orderId, outcome);
      }
      if (controller.signal.aborted) return;
      router.push(resultUrl);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setChecking(service.dataSource === 'api');
      setError(reason instanceof Error ? reason.message : '결제 상태를 확인하지 못했습니다. 다시 확인해주세요.');
    } finally { if (!controller.signal.aborted) { inFlight.current = false; setPaymentState('idle'); } }
  }, [orderId, service, checking, buyerEmail, buyerPhone, buyerName, profileReady, profileError, memberBuyer, router, resultUrl]);

  useEffect(() => {
    if (service.dataSource !== 'api' || !profileReady || profileError || !completeProfile || !order ||
      loadedService !== service || loadedOrderId !== orderId || (order.status !== 'pending' && order.status !== 'failed') ||
      error || checking || autoStarted.current) return;
    autoStarted.current = true;
    void process('success');
  }, [service, profileReady, profileError, completeProfile, order, loadedService, loadedOrderId, orderId, error, checking, process]);

  if (!profileReady) return <div role="status" className="flex min-h-dvh items-center justify-center typo-body-small text-neutral-8">회원정보를 확인하는 중입니다.</div>;
  if (profileError) return <QrshopStateView title="회원정보를 확인할 수 없습니다" description={profileError} actionLabel="다시 확인" onAction={() => setRetry(value => value + 1)} />;
  if (loadedService !== service || loadedOrderId !== orderId) return <div role="status">주문 정보를 불러오는 중입니다.</div>;
  if (error && !order) return <QrshopStateView title="결제를 시작할 수 없습니다" description={error} actionLabel="다시 확인" onAction={() => setRetry(value => value + 1)} />;
  if (!order) return <div role="status" className="flex min-h-dvh items-center justify-center typo-body-small text-neutral-8">주문 정보를 불러오는 중입니다.</div>;

  if (order.status === 'paid' || order.status === 'canceled' || order.status === 'refund-pending') {
    return <QrshopStateView title={order.status === 'paid' ? '결제가 확인되었습니다' : order.status === 'refund-pending' ? '환불 확인이 필요합니다' : '취소된 주문입니다'} description={order.failureMessage} actionLabel="주문 결과 확인" onAction={() => router.push(resultUrl)} />;
  }

  if (service.dataSource === 'api' && completeProfile && !error && !checking) {
    return <div role="status" className="flex min-h-dvh items-center justify-center typo-body-small text-neutral-8">결제창을 여는 중입니다.</div>;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-20">
      <div className="flex flex-col items-center text-center">
        <span className="rounded-full bg-orange-1 px-3 py-1 typo-body-xsmall-bold text-orange-7">{storeSlug === null ? 'Mock 결제' : '온라인 결제'}</span>
        <h1 className="typo-heading-small mt-4 text-neutral-12">결제를 진행해 주세요</h1>
        <p className="typo-body-small mt-1 text-neutral-8">{storeSlug === null ? '실제 결제나 카드 승인은 발생하지 않습니다.' : '결제창에서 결제를 진행한 뒤 서버에서 결과를 확인합니다.'}</p>
      </div>

      <section aria-label="결제할 주문" className="mt-8 rounded-lg bg-white p-4">
        {order.orderCode && <div className="flex items-center justify-between"><span className="typo-body-xsmall text-neutral-8">주문번호</span><strong className="typo-body-xsmall-bold text-neutral-12">{order.orderCode}</strong></div>}
        <div className="mt-3 flex items-center justify-between"><span className="typo-body-xsmall text-neutral-8">결제 수단</span><strong className="typo-body-xsmall-bold text-neutral-12">{order.paymentMethod === 'online' ? '온라인 결제' : '현장 결제'}</strong></div>
        <div className="my-4 border-t border-dashed border-neutral-5" />
        <div className="flex items-center justify-between"><span className="typo-body-small-bold text-neutral-12">총 결제금액</span><strong className="typo-heading-xsmall text-orange-6">{formatWon(order.totalAmount)}</strong></div>
      </section>

      {service.dataSource === 'api' && !checking && !memberBuyer.email && <label className="mt-6 flex flex-col gap-2 typo-body-small text-neutral-12">
        구매자 이메일
        <input ref={emailInput} type="email" required autoComplete="email" value={buyerEmail}
          onChange={event => setBuyerEmail(event.target.value)} disabled={paymentState === 'processing'}
          className="rounded-lg border border-neutral-6 bg-white px-3 py-3" />
      </label>}

      {service.dataSource === 'api' && !checking && !memberBuyer.phone && <label className="mt-4 flex flex-col gap-2 typo-body-small text-neutral-12">
        구매자 휴대폰 번호
        <input ref={phoneInput} type="tel" required autoComplete="tel" pattern="01[016789]-?[0-9]{3,4}-?[0-9]{4}" value={buyerPhone}
          onChange={event => setBuyerPhone(event.target.value)} disabled={paymentState === 'processing'}
          className="rounded-lg border border-neutral-6 bg-white px-3 py-3" />
      </label>}

      {service.dataSource === 'api' && !checking && !memberBuyer.name && <label className="mt-4 flex flex-col gap-2 typo-body-small text-neutral-12">
        구매자 이름
        <input ref={nameInput} type="text" required autoComplete="name" pattern=".*\S.*" value={buyerName}
          onChange={event => setBuyerName(event.target.value)} disabled={paymentState === 'processing'}
          className="rounded-lg border border-neutral-6 bg-white px-3 py-3" />
      </label>}

      {error || paymentState === 'failed' || order.status === 'failed' ? <p role="alert" className="mt-4 rounded-lg bg-orange-1 p-3 typo-body-xsmall text-orange-10">{error ?? order.failureMessage ?? '결제에 실패했습니다. 다시 시도해 주세요.'}</p> : null}
      {paymentState === 'processing' ? <div role="status" className="mt-6 text-center typo-body-small text-neutral-8">{storeSlug === null ? '가짜 결제 승인을 확인하는 중입니다…' : '결제 결과를 확인하는 중입니다…'}</div> : null}

      <div className="mt-auto space-y-2 pt-10">
        <Button color="orange" disabled={paymentState === 'processing' || !profileReady} onClick={() => void process('success')}>{paymentState === 'processing' ? '처리 중…' : checking ? '결제 상태 다시 확인' : order.status === 'failed' ? '결제 다시 시도' : storeSlug === null ? '결제 완료하기' : '결제창 열기'}</Button>
        {storeSlug === null && <Button color="white" disabled={paymentState === 'processing'} onClick={() => void process('failure')}>결제 실패 상태 확인</Button>}
        <button type="button" disabled={paymentState === 'processing'} className="w-full py-2 typo-body-xsmall text-neutral-8" onClick={() => router.push(catalogUrl)}>상품 선택으로 돌아가기</button>
      </div>
    </main>
  );
}
