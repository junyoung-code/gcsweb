'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/layout';

type ReceiptStatus = 'RECEIVED' | 'NOT_RECEIVED';

type OrderItem = {
  id: string;
  name: string;
  option: unknown;
  price: number;
  quantity: number;
  imgUrl: string | null;
};

type OrderDetail = {
  id: string;
  orderCode: string;
  impUid: string;
  orderDate: string;
  isCanceled: boolean;
  paymentStatus: string;
  bagOption?: boolean;
  requiresBagPackaging?: boolean;
  bagNoticeMessage?: string | null;
  items: OrderItem[];
  payment: {
    method: string;
    amount: string;
  };
  receiptStatus: ReceiptStatus;
  actionButtonState?: 'CANCELED' | 'RECEIVED' | 'NOT_RECEIVED';
};

type ItemOptionValue = {
  value?: unknown;
  optionValue?: unknown;
  optionName?: unknown;
  name?: unknown;
};

const formatOptionQuantityText = (option: unknown, quantity: number): string => {
  const quantityText = `${quantity}개`;

  const extractValues = (input: unknown): string[] => {
    if (Array.isArray(input)) {
      return input
        .map((row) => {
          if (row && typeof row === 'object') {
            const value =
              (row as ItemOptionValue).optionValue ??
              (row as ItemOptionValue).value ??
              (row as ItemOptionValue).optionName ??
              (row as ItemOptionValue).name;
            return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
          }
          if (typeof row === 'string') return row.trim();
          return '';
        })
        .filter(Boolean);
    }

    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) return [];
      try {
        return extractValues(JSON.parse(trimmed));
      } catch {
        return [trimmed];
      }
    }

    if (input && typeof input === 'object') {
      return extractValues([input]);
    }

    return [];
  };

  const optionValues = extractValues(option);
  if (optionValues.length === 0) return quantityText;

  return `${optionValues.join(' · ')} / ${quantityText}`;
};

export default function AdminOnsiteDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetchDetail();
  }, [params.id]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/admin/onsite/${params.id}`);
      const json = await res.json();
      if (json.status === 'success') {
        setDetail(json.data);
      } else {
        alert(json.message || '주문 상세를 불러오지 못했습니다.');
        router.back();
      }
    } catch (error) {
      console.error('Failed to fetch onsite order detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: ReceiptStatus) => {
    if (!detail || detail.isCanceled) return;

    try {
      setSubmitting(true);
      const res = await fetch(`/api/v1/admin/onsite/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptStatus: newStatus }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                receiptStatus: newStatus,
                actionButtonState: prev.isCanceled ? 'CANCELED' : newStatus,
              }
            : null
        );
        if (newStatus === 'RECEIVED') {
          router.push('/admin/onsite');
        }
      } else {
        alert(json.message || '수령 상태 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const buttonState = useMemo(() => {
    if (!detail) return 'NOT_RECEIVED' as const;
    if (detail.actionButtonState) return detail.actionButtonState;
    if (detail.isCanceled) return 'CANCELED' as const;
    return detail.receiptStatus === 'RECEIVED' ? ('RECEIVED' as const) : ('NOT_RECEIVED' as const);
  }, [detail]);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#f6f6f5]">
        <p className="text-[15px] text-[#6c6764]">불러오는 중...</p>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f6f6f5] font-pretendard">
      <div className="relative mx-auto flex h-full w-full max-w-[375px] flex-col bg-[#f6f6f5]">
        <NavBar variant="title-back" title="주문 상세" onBack={() => router.back()} />

        <main className="flex flex-1 flex-col overflow-y-auto px-4 pb-[120px] pt-6">
          <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-[#f1f1f1] bg-[#f1f1f1] p-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-start gap-4">
                  <span className="w-24 shrink-0 text-[13px] font-semibold tracking-[-0.26px] text-[#5a5451]">주문 번호</span>
                  <span className="text-[13px] font-semibold tracking-[-0.26px] text-[#2f2824]">{detail.orderCode}</span>
                </div>
                <div className="flex items-start gap-4">
                  <span className="w-24 shrink-0 text-[13px] font-semibold tracking-[-0.26px] text-[#5a5451]">포트원 거래번호</span>
                  <span className="min-w-0 flex-1 break-all whitespace-normal text-[13px] font-semibold leading-[1.4] tracking-[-0.26px] text-[#2f2824]">
                    {typeof detail.impUid === 'string' && detail.impUid.trim() ? detail.impUid : '-'}
                  </span>
                </div>
                <div className="flex items-start gap-4">
                  <span className="w-24 shrink-0 text-[13px] font-semibold tracking-[-0.26px] text-[#5a5451]">주문 일시</span>
                  <span className="text-[13px] font-semibold tracking-[-0.26px] text-[#2f2824]">{detail.orderDate}</span>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <div className="flex w-full items-center justify-between">
                <h2 className="text-[17px] font-bold leading-[1.5] text-[#3f3835]">주문 목록</h2>
                <span className="text-[15px] font-normal leading-[1.5] text-[#3f3835]">총 {detail.items.length}건</span>
              </div>

              {detail.requiresBagPackaging || detail.bagOption ? (
                <div className="flex h-5 items-center gap-2">
                  <svg
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-orange-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12C1.25 6.06294 6.06294 1.25 12 1.25ZM10.5 10.25C10.0858 10.25 9.75 10.5858 9.75 11C9.75 11.4142 10.0858 11.75 10.5 11.75H11.75V17C11.75 17.4142 12.0858 17.75 12.5 17.75C12.9142 17.75 13.25 17.4142 13.25 17V11C13.25 10.6118 12.9551 10.2925 12.5771 10.2539C12.5518 10.2513 12.526 10.25 12.5 10.25H10.5ZM12.5 6.25C12.0858 6.25 11.75 6.58579 11.75 7V8C11.75 8.41421 12.0858 8.75 12.5 8.75C12.9142 8.75 13.25 8.41421 13.25 8V7C13.25 6.58579 12.9142 6.25 12.5 6.25Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="typo-body-xsmall text-orange-6">
                    {detail.bagNoticeMessage ?? '봉투에 담아주세요.'}
                  </span>
                </div>
              ) : null}

              {detail.items.map((item) => (
                <article key={item.id} className="flex w-full flex-col gap-2 rounded-lg border border-[#f1f1f1] bg-[#fdfdfd] px-4 py-3">
                  <div className="flex items-start gap-4">
                    <span className="w-16 shrink-0 text-[13px] text-[#3f3835]">상품명</span>
                    <span className="min-w-0 flex-1 break-words whitespace-normal text-[13px] font-semibold leading-[1.4] text-[#3f3835]">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="w-16 shrink-0 text-[13px] text-[#6c6764]">옵션 / 수량</span>
                    <span className="min-w-0 flex-1 break-words whitespace-normal text-[13px] leading-[1.4] text-[#6c6764]">
                      {formatOptionQuantityText(item.option, item.quantity)}
                    </span>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="w-16 shrink-0 text-[13px] text-[#6c6764]">가격</span>
                    <span className="text-[13px] text-[#6c6764]">{item.price.toLocaleString()}원</span>
                  </div>
                </article>
              ))}
            </section>

            <div className="h-px w-full bg-[#dddcdb]" />

            <section className="flex flex-col gap-4">
              <h2 className="text-[17px] font-bold leading-[1.5] text-[#3f3835]">결제정보</h2>
              <div className="flex w-full flex-col gap-2 rounded-lg border border-[#f1f1f1] bg-[#fdfdfd] p-4">
                <h3 className="text-[15px] font-bold leading-[1.5] text-[#3f3835]">결제 정보</h3>
                <div className="h-px w-full bg-[#f1f1f1]" />
                <div className="flex flex-col gap-2">
                  <div className="flex h-[19.49px] items-center gap-4">
                    <span className="w-16 shrink-0 text-[13px] text-[#85817e]">결제 수단</span>
                    <span className="text-[13px] text-[#85817e]">{detail.payment.method}</span>
                  </div>
                  <div className="flex h-[19.49px] items-center gap-4">
                    <span className="w-16 shrink-0 text-[13px] text-[#85817e]">결제 금액</span>
                    <span className="text-[13px] text-[#85817e]">{detail.payment.amount}</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>

        <div className="fixed bottom-0 left-1/2 z-10 h-[101px] w-full max-w-[375px] -translate-x-1/2 rounded-tl-[12px] rounded-tr-[12px] bg-[#f6f6f5] px-4 pb-8 pt-[11px]">
          {buttonState === 'CANCELED' ? (
            <button
              type="button"
              disabled
              className="flex h-[55px] w-full items-center justify-center rounded-[8px] bg-[#c7c5c4] text-[15px] font-bold text-[#fdfdfd]"
            >
              주문이 취소된 상품입니다
            </button>
          ) : buttonState !== 'RECEIVED' ? (
            <button
              disabled={submitting}
              onClick={() => updateStatus('RECEIVED')}
              className="flex h-[55px] w-full items-center justify-center rounded-[8px] bg-[#3f3835] text-[15px] font-bold text-[#fdfdfd] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? '처리 중...' : '수령 완료'}
            </button>
          ) : (
            <div className="flex w-full items-center gap-4">
              <div className="flex h-[55px] flex-1 items-center justify-center rounded-[8px] bg-[#c7c5c4] text-[15px] font-bold text-[#fdfdfd]">
                수령 완료
              </div>
              <button
                disabled={submitting}
                onClick={() => updateStatus('NOT_RECEIVED')}
                className="flex h-6 w-6 shrink-0 items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-50"
                aria-label="수령 상태 되돌리기"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 15.31 15.31 18 12 18C8.69 18 6 15.31 6 12H3C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 4 12 4Z" fill="#3F3835" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
