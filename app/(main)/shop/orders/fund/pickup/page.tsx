'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NavBar } from '@/components/layout';
import TextField from '@/components/ui/common/TextField';
import Button from '@/components/ui/button/Button';
import CheckboxButton from '@/components/ui/button/CheckboxButton';
import Dropdown from '@/components/ui/button/Dropdown';
import { formatPrice } from '@/lib/utils';
import { ORDER_PAYMENT_METHOD } from '@/lib/order-status';

type CartApiItem = {
  cartItemId: string;
  productId: string | null;
  teamName: string | null;
  productName: string | null;
  thumbnailUrl: string | null;
  options?: unknown;
  price: number;
  quantity: number;
  type: number;
  receiveMethod: number;
};

type ProductDetailResponse = {
  status?: string;
  data?: {
    product?: {
      pickupLocation?: string | null;
      pickupStartDate?: string | null;
      pickupEndDate?: string | null;
    };
  };
};

type UserProfileResponse = {
  name?: string;
  phone?: string;
};

type OrderLineItem = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  optionData?: unknown;
  brand: string;
  title: string;
  optionText: string;
  priceText: string;
  imageUrl: string;
};

const TAG_BASE_CLASS =
  'inline-flex items-center justify-center rounded-[8px] bg-orange-3 px-2 py-[2px] typo-body-xsmall text-orange-7';

const CARD_COMPANY_ITEMS = [
  { label: '비씨', value: '0' },
  { label: '우리', value: '1' },
];

const BANK_CODE_ITEMS = [
  { label: '기업', value: '0' },
  { label: '신한', value: '1' },
];

function parseOptions(value: unknown): Array<{ optionName?: string; optionValue?: string; value?: string }> {
  if (!value || typeof value !== 'object') return [];
  return Array.isArray(value) ? value : [value];
}

function toOptionText(options: ReturnType<typeof parseOptions>) {
  if (options.length === 0) return '';
  return options
    .map((option) => option?.optionValue ?? option?.value ?? option?.optionName ?? '')
    .filter(Boolean)
    .join(' / ');
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const ymd = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return `${ymd[1]}.${ymd[2]}.${ymd[3]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return '-';
  return `${year}.${month}.${day}`;
}

function OrderLineCard({ item }: { item: OrderLineItem }) {
  return (
    <article className="w-full">
      <div className="flex w-full gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt={item.title} className="h-[100px] w-20 rounded-[4px] object-cover" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <p className="typo-body-small text-neutral-8">{item.brand}</p>
            <p className="typo-body-small-bold text-neutral-12">{item.title}</p>
            <p className="typo-body-xsmall text-neutral-11">{item.optionText}</p>
          </div>
          <div className="flex items-center gap-1">
            <span className={TAG_BASE_CLASS}>Fund</span>
            <span className={TAG_BASE_CLASS}>현장수령</span>
          </div>
          <div className="h-px w-full border-t border-dashed border-neutral-5" />
          <p className="typo-body-xsmall-bold text-neutral-11">{item.priceText}</p>
        </div>
      </div>
    </article>
  );
}

function ShopOrdersPickupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [items, setItems] = useState<OrderLineItem[]>([]);
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<0 | 1 | null>(null);
  const [cardCompany, setCardCompany] = useState<0 | 1 | null>(null);
  const [bankCode, setBankCode] = useState<0 | 1 | null>(null);
  const [isAgreed, setIsAgreed] = useState(false);
  const [pickupLocation, setPickupLocation] = useState<string | null>(null);
  const [pickupStartDate, setPickupStartDate] = useState<string | null>(null);
  const [pickupEndDate, setPickupEndDate] = useState<string | null>(null);
  const [confirmedPaymentAmount, setConfirmedPaymentAmount] = useState<number | null>(null);

  const selectedCartItemIds = useMemo(() => {
    const raw = searchParams.get('cartItemIds')?.trim();
    if (!raw) return null;
    const ids = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return ids.length > 0 ? new Set(ids) : null;
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const fetchPageData = async () => {
      setLoading(true);
      try {
        const [cartRes, profileRes] = await Promise.all([
          fetch('/api/v1/mypage/cart/list?page=1&size=100', { cache: 'no-store' }),
          fetch('/api/user/profile', { cache: 'no-store' }),
        ]);

        if (cartRes.status === 401) {
          router.replace('/login');
          return;
        }

        const cartJson = await cartRes.json().catch(() => ({}));
        const rows = ((cartJson?.data?.cartItems ?? []) as CartApiItem[]).filter(
          (row) => row.type === 0 && row.receiveMethod === 1 && typeof row.productId === 'string'
        );
        const scopedRows = selectedCartItemIds
          ? rows.filter((row) => selectedCartItemIds.has(String(row.cartItemId)))
          : rows;

        const mapped: OrderLineItem[] = scopedRows.map((row) => {
          const options = parseOptions(row.options);
          return {
            id: row.cartItemId,
            productId: row.productId as string,
            quantity: row.quantity ?? 1,
            unitPrice: row.price ?? 0,
            optionData: row.options ?? null,
            brand: row.teamName ?? '',
            title: row.productName ?? '',
            optionText: `${toOptionText(options)} / ${row.quantity ?? 1}개`,
            priceText: formatPrice((row.price ?? 0) * (row.quantity ?? 1)),
            imageUrl: row.thumbnailUrl ?? '',
          };
        });

        if (!cancelled) setItems(mapped);

        if (profileRes.ok) {
          const profileJson = (await profileRes.json().catch(() => ({}))) as UserProfileResponse;
          if (!cancelled) {
            setReceiverName(profileJson?.name ?? '');
            setReceiverPhone(profileJson?.phone ?? '');
          }
        }

        const firstProductId = scopedRows[0]?.productId;
        if (firstProductId) {
          const productRes = await fetch(`/api/v1/shop/products/${firstProductId}`, { cache: 'no-store' });
          if (productRes.ok) {
            const productJson = (await productRes.json().catch(() => ({}))) as ProductDetailResponse;
            const product = productJson?.data?.product;
            if (!cancelled) {
              setPickupLocation(product?.pickupLocation ?? null);
              setPickupStartDate(product?.pickupStartDate ?? null);
              setPickupEndDate(product?.pickupEndDate ?? null);
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPageData();
    return () => {
      cancelled = true;
    };
  }, [router, selectedCartItemIds]);

  const calculatedTotal = useMemo(() => items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [items]);
  const displayedTotal = confirmedPaymentAmount ?? calculatedTotal;
  const totalPriceText = formatPrice(displayedTotal);
  const pickupPeriodText = `${formatDate(pickupStartDate)} ~ ${formatDate(pickupEndDate)}`;

  const isPayEnabled =
    items.length > 0 &&
    receiverName.trim().length > 0 &&
    receiverPhone.trim().length > 0 &&
    paymentMethod !== null &&
    ((paymentMethod === 0 && cardCompany !== null) || (paymentMethod === 1 && bankCode !== null)) &&
    isAgreed;

  const handleSubmit = async () => {
    if (!isPayEnabled || isSubmitting || paymentMethod === null) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const payload = {
        productType: 0 as const,
        receiveMethod: 1 as const,
        receiverName: receiverName.trim(),
        receiverPhone: receiverPhone.trim(),
        ordererName: receiverName.trim(),
        ordererPhone: receiverPhone.trim(),
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE, // 카드/계좌 구분은 cardCompany|bankCode
        cardCompany: paymentMethod === 0 ? cardCompany : null,
        bankCode: paymentMethod === 1 ? bankCode : null,
        easyPayProvider: null,
        isPolicyAgreed: true,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.unitPrice,
          optionData: item.optionData,
        })),
      };

      const res = await fetch('/api/v1/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || json?.status !== 'success') {
        setSubmitError(json?.message ?? '주문 생성에 실패했습니다.');
        return;
      }

      const serverAmount = Number(json?.data?.order?.paymentAmount);
      if (Number.isFinite(serverAmount)) {
        setConfirmedPaymentAmount(serverAmount);
      }

      window.alert('주문이 생성되었습니다.');
      router.push('/mypage');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-3 text-neutral-9">주문 정보를 불러오는 중입니다.</div>;
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-3 px-5 text-center">
        <p className="typo-body-small text-neutral-9">Fund 현장수령 주문 항목이 없습니다.</p>
        <button
          type="button"
          className="rounded-lg bg-orange-5 px-4 py-2 typo-body-small-bold text-neutral-2"
          onClick={() => router.push('/cart')}
        >
          장바구니로 이동
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-neutral-3">
      <NavBar variant="title-back" title="주문하기" />

      <div className="mx-auto flex w-full max-w-[375px] flex-col gap-8 px-4 pb-[34px] pt-[25px]">
        <section className="flex flex-col gap-8">
          {items.map((item) => (
            <OrderLineCard key={item.id} item={item} />
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="typo-body-medium-bold text-neutral-10">수령인 정보</h2>
          <TextField
            id="pickup-receiver-name"
            label="이름"
            state="filled"
            inputProps={{ value: receiverName, onChange: (e) => setReceiverName(e.target.value) }}
          />
          <TextField
            id="pickup-receiver-phone"
            label="전화번호"
            state="filled"
            inputProps={{ value: receiverPhone, onChange: (e) => setReceiverPhone(e.target.value) }}
          />
        </section>

        <section className="space-y-3">
          <h2 className="typo-body-medium-bold text-neutral-10">결제수단</h2>
          <div className="flex gap-3">
            <Button
              size="s"
              color={paymentMethod === 0 ? 'orange' : 'white'}
              status="default"
              className="w-auto min-w-[79px]"
              onClick={() => {
                setPaymentMethod(0);
                setBankCode(null);
              }}
            >
              신용카드
            </Button>
            <Button
              size="s"
              color={paymentMethod === 1 ? 'orange' : 'white'}
              status="default"
              className="w-auto min-w-[79px]"
              onClick={() => {
                setPaymentMethod(1);
                setCardCompany(null);
              }}
            >
              가상계좌
            </Button>
          </div>
          {paymentMethod === 0 ? (
            <Dropdown
              label=""
              size="m"
              state={cardCompany === null ? 'default' : 'selected'}
              placeholder="카드 선택"
              value={cardCompany === null ? undefined : CARD_COMPANY_ITEMS.find((x) => x.value === String(cardCompany))?.label}
              items={CARD_COMPANY_ITEMS}
              onSelect={(value) => setCardCompany(Number(value) as 0 | 1)}
            />
          ) : null}
          {paymentMethod === 1 ? (
            <Dropdown
              label=""
              size="m"
              state={bankCode === null ? 'default' : 'selected'}
              placeholder="은행 선택"
              value={bankCode === null ? undefined : BANK_CODE_ITEMS.find((x) => x.value === String(bankCode))?.label}
              items={BANK_CODE_ITEMS}
              onSelect={(value) => setBankCode(Number(value) as 0 | 1)}
            />
          ) : null}
        </section>

        <section className="rounded-2xl bg-neutral-2 p-4">
          <div className="space-y-2 typo-body-xsmall text-black">
            <div className="flex items-center justify-between">
              <p className="font-semibold">수령 장소</p>
              <p>{pickupLocation ?? '-'}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="font-semibold">수령 기간</p>
              <p>{pickupPeriodText}</p>
            </div>
          </div>
          <div className="my-4 h-px w-full border-t border-dashed border-neutral-5" />
          <div className="space-y-2">
            <p className="typo-body-xsmall text-black">
              수령 기간이 경과한 경우 상품 수령이 불가하며,
              <br />
              해당 사유로는 환불이 불가합니다.
            </p>
            <CheckboxButton checked={isAgreed} onChange={setIsAgreed} label="확인하였습니다." className="mt-1" />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="typo-body-medium-bold text-neutral-10">총 결제금액</p>
            <p className="typo-body-medium-bold text-neutral-10">{totalPriceText}</p>
          </div>
          <Button color="orange" status={isPayEnabled && !isSubmitting ? 'default' : 'disabled'} onClick={handleSubmit}>
            결제하기
          </Button>
          {submitError ? <p className="typo-body-xsmall text-red-600">{submitError}</p> : null}
        </section>
      </div>
    </div>
  );
}

export default function ShopOrdersPickupPage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-screen items-center justify-center bg-neutral-3 text-neutral-9">주문 정보를 불러오는 중입니다.</div>}
    >
      <ShopOrdersPickupPageContent />
    </Suspense>
  );
}
