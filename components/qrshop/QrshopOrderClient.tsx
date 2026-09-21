'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createQrshopMockService } from '@/lib/mocks';
import { qrshopRealService } from '@/lib/services';
import type { QrshopCartLine, QrshopPaymentMethod, QrshopProduct } from '@/types/qrshop';
import QrshopCartPanel from './QrshopCartPanel';
import QrshopProductCard from './QrshopProductCard';
import QrshopStateView from './QrshopStateView';

type CatalogState = { status: 'loading' | 'ready' | 'error'; products: QrshopProduct[]; message?: string };

export default function QrshopOrderClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scenario = searchParams.get('scenario');
  const service = useMemo(() => {
    if (scenario === 'empty') return createQrshopMockService({ catalogScenario: { kind: 'empty', data: { items: [], total: 0 }, delayMs: 200 } });
    if (scenario === 'error') return createQrshopMockService({ catalogScenario: { kind: 'error', message: '상품을 불러오지 못했습니다.', delayMs: 200 } });
    return qrshopRealService;
  }, [scenario]);
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading', products: [] });
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<QrshopPaymentMethod>('online');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCatalog({ status: 'loading', products: [] });
    service.getCatalog().then((result) => { if (!cancelled) setCatalog({ status: 'ready', products: result.items }); }).catch((error: unknown) => { if (!cancelled) setCatalog({ status: 'error', products: [], message: error instanceof Error ? error.message : '상품을 불러오지 못했습니다.' }); });
    return () => { cancelled = true; };
  }, [service]);

  const categories = useMemo(() => {
    const unique = new Map<string, string>();
    for (const product of catalog.products) unique.set(product.categoryId, product.categoryName);
    return [{ id: 'all', name: '전체' }, ...[...unique].map(([id, name]) => ({ id, name }))];
  }, [catalog.products]);
  const visibleProducts = useMemo(() => selectedCategory === 'all' ? catalog.products : catalog.products.filter((product) => product.categoryId === selectedCategory), [catalog.products, selectedCategory]);
  const lines = useMemo<QrshopCartLine[]>(() => catalog.products.flatMap((product) => {
    const quantity = quantities[product.id] ?? 0;
    return quantity > 0 ? [{ productId: product.id, productName: product.name, option: product.option, quantity, unitPrice: product.price }] : [];
  }), [catalog.products, quantities]);
  const updateQuantity = (productId: string, next: number) => {
    setQuantities((current) => { const copy = { ...current }; if (next <= 0) delete copy[productId]; else copy[productId] = Math.min(99, next); return copy; });
    setSubmitError(null);
  };
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const order = await service.createOrder({ lines, buyerName, buyerPhone, paymentMethod });
      const nextPath = order.status === 'paid' ? '/QRshop/result' : '/QRshop/pay';
      router.push(`${nextPath}?orderId=${encodeURIComponent(order.orderId)}`);
    } catch (error) { setSubmitError(error instanceof Error ? error.message : '주문을 저장하지 못했습니다.'); }
    finally { setSubmitting(false); }
  };

  if (catalog.status === 'loading') return <div role="status" className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pt-[34px]"><div className="h-9 w-28 animate-pulse rounded bg-neutral-5" /><div className="mt-5 h-7 w-full animate-pulse rounded bg-neutral-5" /><div className="mt-4 grid grid-cols-2 gap-x-[5px] gap-y-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[244px] animate-pulse rounded bg-neutral-5" />)}</div><span className="sr-only">상품을 불러오는 중입니다.</span></div>;
  if (catalog.status === 'error') return <QrshopStateView title="상품을 불러오지 못했습니다" description={catalog.message} actionLabel="다시 시도" onAction={() => router.replace('/QRshop')} />;
  if (catalog.products.length === 0) return <QrshopStateView title="아직 등록된 상품이 없어요" description="새 상품이 준비되면 이곳에서 바로 주문할 수 있습니다." actionLabel="다시 확인" onAction={() => router.replace('/QRshop')} />;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] pb-[360px]">
      <header className="flex h-[71px] items-center px-4 pt-[34px]"><h1 className="typo-heading-large text-neutral-12">잇장샵</h1></header>
      <nav aria-label="상품 카테고리" className="flex h-[42px] items-end overflow-x-auto pl-4">{categories.map((category) => { const active = category.id === selectedCategory; return <button key={category.id} type="button" className={`h-[29px] shrink-0 border-b px-5 typo-body-xsmall ${active ? 'border-orange-5 text-orange-5' : 'border-transparent text-neutral-7'}`} onClick={() => setSelectedCategory(category.id)}>{category.name}</button>; })}</nav>
      <section aria-label="상품 목록" className="grid grid-cols-2 gap-x-[5px] gap-y-3 px-4 pt-4">{visibleProducts.map((product) => <QrshopProductCard key={product.id} product={product} selected={(quantities[product.id] ?? 0) > 0} onSelect={() => updateQuantity(product.id, (quantities[product.id] ?? 0) + 1)} />)}</section>
      <QrshopCartPanel lines={lines} buyerName={buyerName} buyerPhone={buyerPhone} paymentMethod={paymentMethod} agreed={agreed} submitting={submitting} error={submitError} onBuyerNameChange={setBuyerName} onBuyerPhoneChange={setBuyerPhone} onPaymentMethodChange={setPaymentMethod} onAgreementChange={setAgreed} onQuantityChange={updateQuantity} onRemove={(productId) => updateQuantity(productId, 0)} onSubmit={() => void submit()} />
    </main>
  );
}
