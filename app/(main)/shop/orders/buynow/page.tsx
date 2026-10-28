'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NavBar } from '@/components/layout';
import Button from '@/components/ui/button/Button';
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

type OrderLineItem = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  optionData?: unknown;
  productType: number;
  receiveMethod: number;
  brand: string;
  title: string;
  optionText: string;
  priceText: string;
  imageUrl: string;
};

type ProductVariantState = {
  optionSignature: string;
  isSoldOut: boolean;
};

type ProductDetailForSoldOutCheck = {
  variants?: ProductVariantState[];
};

const TAG_BASE_CLASS =
  'inline-flex items-center justify-center rounded-[4px] bg-orange-4 px-[5px] py-[1px] typo-body-xsmall text-neutral-2';

const GUEST_ORDER_STORAGE_KEY = 'shop:buynow-guest-order-items';
const GUEST_TOKEN_STORAGE_KEY = 'shop:guest-token';

function getOrCreateGuestToken(): string {
  const existing = localStorage.getItem(GUEST_TOKEN_STORAGE_KEY)?.trim();
  if (existing) return existing;

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

  localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
  return token;
}

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

function parseVariantSignature(signature: string): Record<string, string> {
  if (!signature || signature === '__default__' || signature === 'default') return {};
  return signature.split('|').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, rawValue] = part.split('=');
    if (!rawKey || rawValue == null) return acc;

    try {
      acc[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
      return acc;
    } catch {
      acc[rawKey] = rawValue;
      return acc;
    }
  }, {});
}

function toSelectedOptionMap(optionData: unknown): Record<string, string> {
  const options = parseOptions(optionData);
  return options.reduce<Record<string, string>>((acc, option) => {
    const key = (option.optionName ?? '').trim();
    const value = (option.optionValue ?? option.value ?? '').trim();
    if (key && value) acc[key] = value;
    return acc;
  }, {});
}

function findMatchedVariant(
  variants: ProductVariantState[],
  selectedMap: Record<string, string>
): ProductVariantState | null {
  if (Object.keys(selectedMap).length === 0) {
    return (
      variants.find((variant) => variant.optionSignature === '__default__' || variant.optionSignature === 'default') ??
      null
    );
  }

  return (
    variants.find((variant) => {
      const parsed = parseVariantSignature(variant.optionSignature);
      const parsedKeys = Object.keys(parsed);
      const selectedKeys = Object.keys(selectedMap);
      if (parsedKeys.length !== selectedKeys.length) return false;
      return selectedKeys.every((key) => parsed[key] === selectedMap[key]);
    }) ?? null
  );
}

function OrderLineCard({ item }: { item: OrderLineItem }) {
  const productTypeLabel = item.productType === 0 ? 'Fund' : item.productType === 1 ? 'BuyNow' : '상품';
  const receiveMethodLabel = item.receiveMethod === 0 ? '택배배송' : item.receiveMethod === 1 ? '현장수령' : '수령방식';

  return (
    <article className="w-full">
      <div className="flex w-full gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt={item.title} className="h-[100px] w-20 rounded-[4px] object-cover" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <p className="typo-body-xsmall text-neutral-11">{item.brand}</p>
            <p className="typo-heading-xsmall text-neutral-12">{item.title}</p>
            <p className="typo-body-xsmall text-neutral-11">{item.optionText}</p>
          </div>
          <div className="flex items-center gap-[5px]">
            <span className={TAG_BASE_CLASS}>{productTypeLabel}</span>
            <span className={TAG_BASE_CLASS}>{receiveMethodLabel}</span>
          </div>
          <div className="h-px w-full border-t border-dashed border-neutral-5" />
          <p className="typo-body-xsmall-bold text-neutral-11">{item.priceText}</p>
        </div>
      </div>
    </article>
  );
}

function ShopOrdersBuyNowPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [items, setItems] = useState<OrderLineItem[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<typeof ORDER_PAYMENT_METHOD[keyof typeof ORDER_PAYMENT_METHOD]>(ORDER_PAYMENT_METHOD.ONLINE);
  const [showSoldOutModal, setShowSoldOutModal] = useState(false);

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
        const parseGuestItems = () => {
          const rawGuestItems = sessionStorage.getItem(GUEST_ORDER_STORAGE_KEY);
          if (!rawGuestItems) return [] as OrderLineItem[];
          const parsed = JSON.parse(rawGuestItems) as unknown;
          if (!Array.isArray(parsed)) return [] as OrderLineItem[];
          return (parsed as Array<Partial<OrderLineItem>>).map((item, index) => ({
            id: item.id ?? `guest-${index}`,
            productId: item.productId ?? '',
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice ?? 0,
            optionData: item.optionData ?? null,
            productType: item.productType ?? 1,
            receiveMethod: item.receiveMethod ?? 1,
            brand: item.brand ?? '',
            title: item.title ?? '',
            optionText: item.optionText ?? '',
            priceText: item.priceText ?? formatPrice(item.unitPrice ?? 0),
            imageUrl: item.imageUrl ?? '',
          }));
        };

        const guestItems = parseGuestItems();
        if (!selectedCartItemIds && guestItems.length > 0) {
          if (!cancelled) {
            setIsAuthenticated(false);
            setItems(guestItems);
          }
          return;
        }

        const profileRes = await fetch('/api/user/profile', { cache: 'no-store' });
        if (!profileRes.ok) {
          if (!cancelled) {
            setIsAuthenticated(false);
            setItems(guestItems);
          }
          return;
        }

        const cartRes = await fetch('/api/v1/mypage/cart/list?page=1&size=100', { cache: 'no-store' });
        if (!cartRes.ok) {
          if (!cancelled) {
            setIsAuthenticated(false);
            setItems(guestItems);
          }
          return;
        }

        const cartJson = await cartRes.json().catch(() => ({}));
        const rows = ((cartJson?.data?.cartItems ?? []) as CartApiItem[]).filter(
          (row) => row.type === 1 && row.receiveMethod === 1 && typeof row.productId === 'string'
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
            productType: row.type ?? 1,
            receiveMethod: row.receiveMethod ?? 1,
            brand: row.teamName ?? '',
            title: row.productName ?? '',
            optionText: `${toOptionText(options)} / ${row.quantity ?? 1}개`,
            priceText: formatPrice((row.price ?? 0) * (row.quantity ?? 1)),
            imageUrl: row.thumbnailUrl ?? '',
          };
        });

        if (!cancelled) {
          setIsAuthenticated(true);
          setItems(mapped);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPageData();
    return () => {
      cancelled = true;
    };
  }, [selectedCartItemIds]);

  const totalPriceText = useMemo(() => {
    const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    return formatPrice(total);
  }, [items]);

  const isPayEnabled = items.length > 0;

  const handleSubmit = async () => {
    if (!isPayEnabled || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean)));
      const productEntries = await Promise.all(
        productIds.map(async (id) => {
          const res = await fetch(`/api/v1/shop/products/${id}`, { cache: 'no-store' });
          const json = await res.json().catch(() => ({}));
          const product = json?.data?.product as ProductDetailForSoldOutCheck | undefined;
          return [id, product ?? null] as const;
        })
      );

      const productMap = new Map<string, ProductDetailForSoldOutCheck | null>(productEntries);

      const hasSoldOut = items.some((item) => {
        const product = productMap.get(item.productId);
        if (!product?.variants || product.variants.length === 0) return false;
        const selectedMap = toSelectedOptionMap(item.optionData);
        const matched = findMatchedVariant(product.variants, selectedMap);
        return Boolean(matched?.isSoldOut);
      });

      if (hasSoldOut) {
        setShowSoldOutModal(true);
        return;
      }

      const payload = {
        productType: 1 as const,
        receiveMethod: 1 as const,
        paymentMethod,
        cardCompany: null,
        bankCode: null,
        easyPayProvider: null,
        isPolicyAgreed: true,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.unitPrice,
          optionData: item.optionData,
        })),
      };

      const guestToken = !isAuthenticated ? getOrCreateGuestToken() : null;
      const res = await fetch('/api/v1/shop/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(guestToken ? { 'x-guest-token': guestToken } : {}),
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || json?.status !== 'success') {
        const errorCode = typeof json?.code === 'string' ? json.code : '';
        const errorMessage = typeof json?.message === 'string' ? json.message : '';
        const isSoldOutError =
          errorCode === 'INVALID_STATE' &&
          errorMessage.toLowerCase().includes('sold-out variants cannot be ordered');

        if (isSoldOutError) {
          setShowSoldOutModal(true);
          setSubmitError(null);
          return;
        }

        setSubmitError(json?.message ?? '주문 생성에 실패했습니다.');
        return;
      }

      if (!isAuthenticated) {
        sessionStorage.removeItem(GUEST_ORDER_STORAGE_KEY);
      }

      const orderId = json?.data?.order?.id;
      if (!orderId) {
        window.alert('주문이 생성되었습니다.');
        router.push(isAuthenticated ? '/mypage' : '/shop');
        return;
      }

      // 결제 수단에 따라 리다이렉트
      if (paymentMethod === ORDER_PAYMENT_METHOD.ON_SITE) {
        router.push(`/shop/orders/buynow/result?orderId=${orderId}&counterPay=1`);
      } else {
        router.push(`/shop/orders/buynow/pay?orderId=${orderId}`);
      }
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
        <p className="typo-body-small text-neutral-9">BuyNow 주문 항목이 없습니다.</p>
        <button
          type="button"
          className="rounded-lg bg-orange-5 px-4 py-2 typo-body-small-bold text-neutral-2"
          onClick={() => router.push(isAuthenticated ? '/cart' : '/shop')}
        >
          이동하기
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-neutral-3">
      <NavBar variant="title-back" title="주문하기" />

      <div className="mx-auto flex w-full max-w-[375px] flex-col gap-8 px-4 pb-[34px] pt-[24px]">
        <section className="space-y-3">
          <h2 className="typo-body-medium-bold text-neutral-10">주문한 상품</h2>
          <div className="space-y-8">
            {items.map((item) => (
              <OrderLineCard key={item.id} item={item} />
            ))}
          </div>
        </section>

        <div className="h-px w-full bg-neutral-4" />

        <section className="space-y-3">
          <h2 className="typo-body-medium-bold text-neutral-10">결제수단</h2>
          <div className="flex gap-3">
            <Button
              size="s"
              color={paymentMethod === ORDER_PAYMENT_METHOD.ONLINE ? 'orange' : 'white'}
              status="default"
              className="w-auto min-w-[88px]"
              onClick={() => setPaymentMethod(ORDER_PAYMENT_METHOD.ONLINE)}
            >
              온라인결제
            </Button>
            <Button
              size="s"
              color={paymentMethod === ORDER_PAYMENT_METHOD.ON_SITE ? 'orange' : 'white'}
              status="default"
              className="w-auto min-w-[88px]"
              onClick={() => setPaymentMethod(ORDER_PAYMENT_METHOD.ON_SITE)}
            >
              현장결제
            </Button>
          </div>
        </section>

        <section className="space-y-4 pt-20">
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

      {showSoldOutModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.3)] px-4">
          <div className="w-[343px] rounded-[12px] bg-white px-7 pb-[23px] pt-10">
            <div className="flex flex-col gap-[30px]">
              <div className="flex w-full flex-col items-center gap-1 text-center">
                <p className="w-[287px] typo-heading-xxsmall text-neutral-12">품절된 상품이 포함되어 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/shop')}
                className="h-[47px] w-full rounded-lg bg-orange-5 typo-body-small-bold text-neutral-2"
              >
                Shop으로 이동
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ShopOrdersBuyNowPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-3 text-neutral-9">
          주문 정보를 불러오는 중입니다.
        </div>
      }
    >
      <ShopOrdersBuyNowPageContent />
    </Suspense>
  );
}

