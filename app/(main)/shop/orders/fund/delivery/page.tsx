'use client';

import Script from 'next/script';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NavBar } from '@/components/layout';
import TextField from '@/components/ui/common/TextField';
import Button from '@/components/ui/button/Button';
import Dropdown from '@/components/ui/button/Dropdown';
import { formatPrice } from '@/lib/utils';
import { ORDER_PAYMENT_METHOD } from '@/lib/order-status';

const POSTCODE_SCRIPT = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

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
  'inline-flex items-center justify-center rounded-[4px] bg-orange-4 px-[5px] typo-body-xsmall text-neutral-2';

const CARD_COMPANY_ITEMS = [
  { label: '비씨', value: '0' },
  { label: '우리', value: '1' },
  { label: '삼성', value: '2' },
  { label: '현대', value: '3' },
  { label: '롯데', value: '4' },
  { label: '하나', value: '5' },
  { label: '국민', value: '6' },
  { label: 'NH', value: '7' },
  { label: '신한', value: '8' },
  { label: '씨티', value: '9' },
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

function OrderLineCard({ item }: { item: OrderLineItem }) {
  return (
    <article className="w-full">
      <div className="flex w-full gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt={item.title} className="h-[100px] w-20 rounded-[4px] object-cover" />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="space-y-[5px]">
            <div className="space-y-[1px] leading-[1.5]">
              <p className="typo-body-xsmall text-neutral-11">{item.brand}</p>
              <p className="typo-body-medium-bold text-neutral-12">{item.title}</p>
              <p className="typo-body-xsmall text-neutral-11">{item.optionText}</p>
            </div>

            <div className="flex items-center gap-[5px]">
              <span className={TAG_BASE_CLASS}>Fund</span>
              <span className={TAG_BASE_CLASS}>택배배송</span>
            </div>
          </div>

          <div className="h-px w-full border-t border-dashed border-neutral-5" />
          <p className="typo-body-xsmall-bold text-neutral-11">{item.priceText}</p>
        </div>
      </div>
    </article>
  );
}

function ShopOrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [items, setItems] = useState<OrderLineItem[]>([]);

  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [addressMain, setAddressMain] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<0 | 1>(0);
  const [cardCompany, setCardCompany] = useState<number | null>(null);
  const [bankCode, setBankCode] = useState<0 | 1 | null>(null);
  const [billingKey, setBillingKey] = useState<string | null>(null);
  const [isIssuingBillingKey, setIsIssuingBillingKey] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardBirth, setCardBirth] = useState('');
  const [cardPwd2digit, setCardPwd2digit] = useState('');
  const [confirmedPaymentAmount, setConfirmedPaymentAmount] = useState<number | null>(null);
  const openAddressSearch = () => {
    const Postcode = typeof window !== 'undefined' && (window.kakao?.Postcode ?? window.daum?.Postcode);
    if (!Postcode) {
      window.alert('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    new Postcode({
      oncomplete(data: { zonecode: string; roadAddress: string; jibunAddress: string; userSelectedType: string; bname?: string; buildingName?: string; apartment?: string }) {
        setZipCode(data.zonecode);
        let addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
        let extra = '';
        if (data.userSelectedType === 'R') {
          if (data.bname && /[동|로|가]$/g.test(data.bname)) extra += data.bname;
          if (data.buildingName && data.apartment === 'Y') extra += (extra ? ', ' : '') + data.buildingName;
          if (extra) addr += ` (${extra})`;
        }
        setAddressMain(addr);
      },
    }).open();
  };

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
          (row) => row.type === 0 && row.receiveMethod === 0 && typeof row.productId === 'string'
        );
        const scopedRows = selectedCartItemIds
          ? rows.filter((row) => selectedCartItemIds.has(String(row.cartItemId)))
          : rows;

        const mapped: OrderLineItem[] = scopedRows.map((row) => {
          const options = parseOptions(row.options);
          const optionText = toOptionText(options);

          return {
            id: row.cartItemId,
            productId: row.productId as string,
            quantity: row.quantity ?? 1,
            unitPrice: row.price ?? 0,
            optionData: row.options ?? null,
            brand: row.teamName ?? '',
            title: row.productName ?? '',
            optionText: `${optionText ? `${optionText} / ` : ''}${row.quantity ?? 1}개`,
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

  const isPayEnabled =
    items.length > 0 &&
    receiverName.trim().length > 0 &&
    receiverPhone.trim().length > 0 &&
    zipCode.trim().length > 0 &&
    addressMain.trim().length > 0 &&
    addressDetail.trim().length > 0 &&
    ((paymentMethod === 0 && cardCompany !== null && Boolean(billingKey)) || (paymentMethod === 1 && bankCode !== null));

  const canRegisterCard =
    paymentMethod === 0 &&
    cardCompany !== null &&
    cardNumber.replace(/\D/g, '').length >= 14 &&
    cardExpiry.replace(/\D/g, '').length === 4 &&
    cardBirth.replace(/\D/g, '').length === 6 &&
    cardPwd2digit.replace(/\D/g, '').length === 2 &&
    receiverName.trim().length > 0 &&
    receiverPhone.trim().length > 0;

  const handleIssueBillingKey = async () => {
    if (isIssuingBillingKey) return;
    setSubmitError(null);
    setIsIssuingBillingKey(true);
    try {
      const generatedCustomerUid = `fund-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const reserveRes = await fetch('/api/v1/fund/billing/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerUid: generatedCustomerUid,
          cardNumber: cardNumber.trim(),
          expiry: cardExpiry.trim(),
          birth: cardBirth.trim(),
          pwd2digit: cardPwd2digit.trim(),
          buyerName: receiverName.trim(),
          buyerTel: receiverPhone.trim(),
          buyerEmail: 'no-reply@gcsweb.kr',
        }),
      });
      const reserveJson = await reserveRes.json().catch(() => ({}));
      if (!reserveRes.ok || reserveJson?.status !== 'success') {
        setSubmitError(reserveJson?.message ?? '카드 예약 등록에 실패했습니다.');
        return;
      }

      const issuedKey = typeof reserveJson?.data?.customerUid === 'string' ? reserveJson.data.customerUid.trim() : '';
      if (!issuedKey) {
        setSubmitError('빌링키 발급 응답이 올바르지 않습니다.');
        return;
      }

      setBillingKey(issuedKey);
      window.alert('카드 예약 등록이 완료되었습니다. 실제 결제는 만기 조건 충족 시 진행됩니다.');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '빌링키 발급에 실패했습니다.');
    } finally {
      setIsIssuingBillingKey(false);
    }
  };

  const handleSubmit = async () => {
    if (!isPayEnabled || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        productType: 0 as const,
        receiveMethod: 0 as const,
        receiverName: receiverName.trim(),
        receiverPhone: receiverPhone.trim(),
        deliveryZipCode: zipCode.trim(),
        deliveryAddressMain: addressMain.trim(),
        deliveryAddressDetail: addressDetail.trim(),
        deliveryMessage: deliveryMessage.trim(),
        ordererName: receiverName.trim(),
        ordererPhone: receiverPhone.trim(),
        paymentMethod: ORDER_PAYMENT_METHOD.ONLINE, // 카드/계좌 구분은 cardCompany|bankCode
        billingKey: paymentMethod === 0 ? billingKey : undefined,
        cardCompany: paymentMethod === 0 ? cardCompany : null,
        bankCode: paymentMethod === 1 ? bankCode : null,
        easyPayProvider: null,
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

      const orderId = json?.data?.order?.id as string | undefined;
      const paymentAmount = Number(json?.data?.order?.paymentAmount);
      if (Number.isFinite(paymentAmount)) {
        setConfirmedPaymentAmount(paymentAmount);
      }

      if (!orderId) {
        setSubmitError('주문 생성 응답이 올바르지 않습니다.');
        return;
      }
      window.alert('주문이 생성되었습니다.');
      router.push('/mypage');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-3 text-neutral-9">
        주문 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-3 px-5 text-center">
        <p className="typo-body-small text-neutral-9">Fund 택배배송 주문 항목이 없습니다.</p>
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
      <Script src={POSTCODE_SCRIPT} strategy="lazyOnload" />
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
            id="receiver-name"
            label="이름"
            state="filled"
            inputProps={{ value: receiverName, onChange: (e) => setReceiverName(e.target.value) }}
          />
          <TextField
            id="receiver-phone"
            label="전화번호"
            state="filled"
            inputProps={{ value: receiverPhone, onChange: (e) => setReceiverPhone(e.target.value) }}
          />
        </section>

        <section className="space-y-4">
          <h2 className="typo-body-medium-bold text-neutral-10">배송 정보</h2>

          <div className="space-y-3">
            <div className="flex items-end gap-4">
              <div className="min-w-0 flex-1">
                <TextField
                  id="delivery-zip"
                  label="배송지"
                  placeholder="우편번호"
                  state={zipCode ? 'filled' : 'default'}
                  inputProps={{ value: zipCode, onChange: (e) => setZipCode(e.target.value) }}
                />
              </div>
              <Button size="s" color="black" className="h-[39px] w-auto px-5" onClick={openAddressSearch}>
                검색
              </Button>
            </div>

            <TextField
              id="delivery-address-main"
              label=""
              placeholder="주소"
              state={addressMain ? 'filled' : 'default'}
              inputProps={{ value: addressMain, onChange: (e) => setAddressMain(e.target.value) }}
            />
            <TextField
              id="delivery-address-detail"
              label=""
              placeholder="상세 주소"
              state={addressDetail ? 'filled' : 'default'}
              inputProps={{ value: addressDetail, onChange: (e) => setAddressDetail(e.target.value) }}
            />
            <TextField
              id="delivery-message"
              label=""
              placeholder="배송 메시지 (선택)"
              inputProps={{ value: deliveryMessage, onChange: (e) => setDeliveryMessage(e.target.value) }}
            />
          </div>
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
            <div className="space-y-3">
              <Dropdown
                label=""
                size="m"
                state={cardCompany === null ? 'default' : 'selected'}
                placeholder="카드 선택"
                value={cardCompany === null ? undefined : CARD_COMPANY_ITEMS.find((x) => x.value === String(cardCompany))?.label}
                items={CARD_COMPANY_ITEMS}
                onSelect={(value) => setCardCompany(Number(value))}
              />
              <TextField
                id="card-number"
                label=""
                placeholder="카드번호(숫자만)"
                state={cardNumber ? 'filled' : 'default'}
                inputProps={{ value: cardNumber, onChange: (e) => setCardNumber(e.target.value.replace(/[^\d]/g, '')) }}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  id="card-expiry"
                  label=""
                  placeholder="유효기간(MMYY)"
                  state={cardExpiry ? 'filled' : 'default'}
                  inputProps={{ value: cardExpiry, onChange: (e) => setCardExpiry(e.target.value.replace(/[^\d]/g, '').slice(0, 4)) }}
                />
                <TextField
                  id="card-birth"
                  label=""
                  placeholder="생년월일(YYMMDD)"
                  state={cardBirth ? 'filled' : 'default'}
                  inputProps={{ value: cardBirth, onChange: (e) => setCardBirth(e.target.value.replace(/[^\d]/g, '').slice(0, 6)) }}
                />
              </div>
              <TextField
                id="card-pwd2"
                label=""
                placeholder="카드 비밀번호 앞 2자리"
                state={cardPwd2digit ? 'filled' : 'default'}
                inputProps={{ value: cardPwd2digit, onChange: (e) => setCardPwd2digit(e.target.value.replace(/[^\d]/g, '').slice(0, 2)) }}
              />
              <Button
                size="s"
                color={billingKey ? 'orange' : 'black'}
                className="h-[39px] w-auto px-5"
                onClick={handleIssueBillingKey}
                disabled={isIssuingBillingKey || !canRegisterCard}
              >
                {isIssuingBillingKey
                  ? '카드 등록 중...'
                  : !canRegisterCard
                    ? '입력값 확인 중...'
                    : billingKey
                      ? '카드 등록 완료'
                      : '카드 등록'}
              </Button>
              <p className="typo-body-xsmall text-neutral-9">
                카드 등록 시 1원 승인 후 즉시 취소되며, 실제 결제는 만기 조건 충족 시 자동으로 진행됩니다.
              </p>
            </div>
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

export default function ShopOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-3 text-neutral-9">
          주문 정보를 불러오는 중입니다.
        </div>
      }
    >
      <ShopOrdersPageContent />
    </Suspense>
  );
}
