'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatPrice } from '@/lib/utils';

const GUEST_TOKEN_STORAGE_KEY = 'shop:guest-token';

type ResultLine = {
  id: string;
  label: string;
  quantity: number;
  unitPriceText: string;
  lineTotalText: string;
};

function lineLabelFromOrderItem(item: {
  optionData?: unknown;
  optionText?: string;
}): string {
  const od = item.optionData;
  if (od && typeof od === 'object' && !Array.isArray(od)) {
    const ov = (od as { optionValue?: string }).optionValue;
    if (typeof ov === 'string' && ov.trim()) return ov.trim();
  }
  const raw = typeof item.optionText === 'string' ? item.optionText : '';
  const parts = raw.split(' / ');
  if (parts.length >= 2) {
    return parts.slice(0, -1).join(' / ').trim() || raw;
  }
  return raw || '상품';
}

function ResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') ?? searchParams.get('paymentId');
  const portoneCode = searchParams.get('code');
  const portoneMessage = searchParams.get('message');
  const isCounterPay = searchParams.get('counterPay') === '1';

  const [status, setStatus] = useState<'loading' | 'success' | 'fail'>('loading');
  const [message, setMessage] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [orderLines, setOrderLines] = useState<ResultLine[]>([]);

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
  }, [orderId, portoneCode, portoneMessage, isCounterPay]);

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

      if (res.ok && json?.status === 'success') {
        const code = json?.data?.order?.orderCode;
        if (typeof code === 'string' && code) setOrderCode(code);

        const rawItems = json?.data?.order?.items;
        const rows: ResultLine[] = Array.isArray(rawItems)
          ? rawItems.map((item: Record<string, unknown>) => {
              const qty = Math.max(1, Number(item.quantity ?? 1));
              const unit = Number(item.price ?? 0);
              return {
                id: String(item.id ?? ''),
                label: lineLabelFromOrderItem({
                  optionData: item.optionData,
                  optionText: typeof item.optionText === 'string' ? item.optionText : '',
                }),
                quantity: qty,
                unitPriceText: formatPrice(unit),
                lineTotalText:
                  typeof item.priceText === 'string'
                    ? item.priceText
                    : formatPrice(unit * qty),
              };
            })
          : [];
        setOrderLines(rows);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, status]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center px-5">
        <p className="text-[15px] text-neutral-8">
          {isCounterPay ? '주문 정보를 불러오는 중입니다.' : '결제 결과를 확인 중입니다.'}
        </p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-dvh flex-col items-center gap-6 px-4 py-8 pb-[max(32px,env(safe-area-inset-bottom))]">
        <div className="flex w-full max-w-[400px] flex-col items-center text-center">
          <div className="rounded-full bg-orange-1 p-4 text-[40px]" aria-hidden>
            ✓
          </div>
          <p className="mt-4 text-[20px] font-bold leading-snug text-neutral-12">
            {isCounterPay ? (
              <>
                <span className="text-[#dc2626]">현장결제</span>{' '}주문이 완료되었습니다.
              </>
            ) : (
              <>
                <span className="text-[#2563eb]">온라인</span>{' '}결제가 완료되었습니다.
              </>
            )}
          </p>
          {orderCode ? (
            <p className="mt-2 text-[16px] font-semibold text-orange-5">주문번호 {orderCode}</p>
          ) : null}
          <p className="mt-2 text-[14px] text-neutral-8">
            {isCounterPay
              ? '카운터에서 결제 시 주문번호를 알려 주세요.'
              : '카운터에서 상품 수령 시 주문번호를 알려 주세요.'}
          </p>
          <div
            className="mt-4 w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-[14px] font-semibold leading-snug text-amber-950"
            role="status"
          >
            이 화면을 닫지 말고 카운터 직원에게 보여 주세요.
          </div>
        </div>

        {orderLines.length > 0 ? (
          <div className="w-full max-w-[400px]">
            <p className="mb-2 text-left text-[14px] font-semibold text-neutral-11">주문 내역</p>
            <div className="overflow-x-auto rounded-xl border border-neutral-5 bg-white shadow-sm">
              <table className="w-full min-w-[280px] border-collapse text-left text-[13px] text-neutral-11">
                <thead>
                  <tr className="border-b border-neutral-5 bg-[#f2f4f6]">
                    <th className="px-3 py-2.5 font-semibold text-neutral-12">상품</th>
                    <th className="w-12 px-2 py-2.5 text-center font-semibold text-neutral-12">수량</th>
                    <th className="w-[72px] px-2 py-2.5 text-right font-semibold text-neutral-12">단가</th>
                    <th className="w-[88px] px-3 py-2.5 text-right font-semibold text-neutral-12">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {orderLines.map((row) => (
                    <tr key={row.id || row.label} className="border-b border-neutral-4 last:border-b-0">
                      <td className="px-3 py-2.5 align-top">{row.label}</td>
                      <td className="px-2 py-2.5 text-center align-top">{row.quantity}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right align-top tabular-nums">
                        {row.unitPriceText}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-neutral-12 align-top tabular-nums">
                        {row.lineTotalText}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="mt-auto w-full max-w-[320px] rounded-[14px] bg-orange-5 py-4 text-[16px] font-semibold text-white"
          onClick={() => router.push('/QRshop/v1')}
        >
          처음으로
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-[18px] font-semibold text-neutral-12">결제에 실패했습니다</p>
      <p className="text-[14px] text-neutral-8">{message}</p>
      <button
        type="button"
        className="w-full max-w-[320px] rounded-[14px] bg-orange-5 py-4 text-[16px] font-semibold text-white"
        onClick={() => router.push('/QRshop/v1')}
      >
        다시 주문하기
      </button>
    </div>
  );
}

export default function QRshopResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <p className="text-[15px] text-neutral-8">결과를 확인 중입니다.</p>
        </div>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
