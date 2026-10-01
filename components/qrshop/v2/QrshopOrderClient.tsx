'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createQrshopMockService,
  qrshopMockService,
  qrshopQaProducts,
} from '@/lib/mocks';
import type { QrshopCartLine, QrshopProduct } from '@/types/qrshop';
import QrshopCartPanel from './QrshopCartPanel';
import QrshopOptionModal from './QrshopOptionModal';
import QrshopProductCard from './QrshopProductCard';
import QrshopSoldOutModal from './QrshopSoldOutModal';
import QrshopStateView from './QrshopStateView';

type CatalogState = { status: 'loading' | 'ready' | 'error'; products: QrshopProduct[]; message?: string };

export default function QrshopOrderClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scenario = searchParams.get('scenario');
  const service = useMemo(() => {
    if (scenario === 'empty') return createQrshopMockService({ catalogScenario: { kind: 'empty', data: { items: [], total: 0 }, delayMs: 200 } });
    if (scenario === 'error') return createQrshopMockService({ catalogScenario: { kind: 'error', message: '상품을 불러오지 못했습니다.', delayMs: 200 } });
    if (scenario === 'edge-cases') return createQrshopMockService({
      catalogScenario: {
        kind: 'success',
        data: { items: qrshopQaProducts, total: qrshopQaProducts.length },
        delayMs: 100,
      },
    });
    return qrshopMockService;
  }, [scenario]);
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading', products: [] });
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [optionProducts, setOptionProducts] = useState<QrshopProduct[] | null>(null);
  const [soldOutProductName, setSoldOutProductName] = useState<string | null>(null);
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
    return [
      { id: 'all', name: '전체' },
      ...[...unique].map(([id, name]) => ({ id, name })),
      ...(catalog.products.some((product) => product.soldOut) ? [{ id: 'soldout', name: '품절' }] : []),
    ];
  }, [catalog.products]);
  const productGroups = useMemo(() => {
    const groups = new Map<string, QrshopProduct[]>();
    for (const product of catalog.products) {
      const key = `${product.categoryId}:${product.name}:${product.imageUrl ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), product]);
    }
    return [...groups.entries()].map(([key, products]) => ({ key, products }));
  }, [catalog.products]);
  const visibleGroups = useMemo(() => {
    if (selectedCategory === 'all') return productGroups;
    if (selectedCategory === 'soldout') return productGroups.filter(({ products }) => products.some((product) => product.soldOut));
    return productGroups.filter(({ products }) => products[0]?.categoryId === selectedCategory);
  }, [productGroups, selectedCategory]);
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
    if ((scenario === 'soldout' || selectedCategory === 'soldout') && lines[0]) {
      updateQuantity(lines[0].productId, 0);
      setAgreed(false);
      setSoldOutProductName(lines[0].productName);
      return;
    }
    setSubmitting(true); setSubmitError(null);
    try {
      const order = await service.createOrder({ lines, buyerName: '', buyerPhone: '', paymentMethod: 'online' });
      router.push(`/QRshop/pay?orderId=${encodeURIComponent(order.orderId)}`);
    } catch (error) { setSubmitError(error instanceof Error ? error.message : '주문을 저장하지 못했습니다.'); }
    finally { setSubmitting(false); }
  };

  if (catalog.status === 'loading') return <div role="status" className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pt-[34px]"><div className="h-9 w-28 animate-pulse rounded bg-neutral-5" /><div className="mt-5 h-7 w-full animate-pulse rounded bg-neutral-5" /><div className="mt-4 grid grid-cols-2 gap-x-[5px] gap-y-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[244px] animate-pulse rounded bg-neutral-5" />)}</div><span className="sr-only">상품을 불러오는 중입니다.</span></div>;
  if (catalog.status === 'error') return <QrshopStateView icon="warning" title="존재하지 않는 상점입니다" description="링크를 다시 확인해주시기 바랍니다." />;
  if (catalog.products.length === 0) return <QrshopStateView icon="cart" title="해당 샵에 아직 등록된 상품이 없습니다!" />;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] pb-[360px]">
      <header className="flex h-[71px] items-center px-4 pt-[34px]"><h1 className="typo-heading-large text-neutral-12">잇장샵</h1></header>
      <nav aria-label="상품 카테고리" className="flex h-[42px] items-end overflow-x-auto pl-4">{categories.map((category) => { const active = category.id === selectedCategory; return <button key={category.id} type="button" className={`h-[29px] shrink-0 border-b px-5 typo-body-xsmall ${active ? 'border-orange-5 text-orange-5' : 'border-transparent text-neutral-7'}`} onClick={() => setSelectedCategory(category.id)}>{category.name}</button>; })}</nav>
      <section aria-label="상품 목록" className="grid grid-cols-2 gap-x-[5px] gap-y-3 px-4 pt-4">
        {visibleGroups.map(({ key, products }) => {
          const product = products.reduce((lowest, current) => current.price < lowest.price ? current : lowest);
          const soldOut = products.every((item) => item.soldOut);
          return (
            <QrshopProductCard
              key={key}
              product={product}
              optionNames={products.flatMap((item) => item.option ? [item.option] : [])}
              selected={products.some((item) => (quantities[item.id] ?? 0) > 0)}
              soldOut={soldOut}
              onSelect={() => {
                if (soldOut) setSoldOutProductName(product.name);
                else setOptionProducts(products);
              }}
            />
          );
        })}
      </section>
      <QrshopCartPanel lines={lines} agreed={agreed} submitting={submitting} error={submitError} onAgreementChange={setAgreed} onQuantityChange={updateQuantity} onRemove={(productId) => updateQuantity(productId, 0)} onSubmit={() => void submit()} />
      {optionProducts ? (
        <QrshopOptionModal
          products={optionProducts}
          selectedIds={optionProducts.filter((product) => (quantities[product.id] ?? 0) > 0).map((product) => product.id)}
          onClose={() => setOptionProducts(null)}
          onConfirm={(selectedIds) => {
            setQuantities((current) => {
              const next = { ...current };
              for (const product of optionProducts) {
                if (selectedIds.includes(product.id)) next[product.id] = next[product.id] || 1;
                else delete next[product.id];
              }
              return next;
            });
            setSubmitError(null);
            setOptionProducts(null);
          }}
        />
      ) : null}
      {soldOutProductName ? <QrshopSoldOutModal productName={soldOutProductName} onConfirm={() => setSoldOutProductName(null)} /> : null}
    </main>
  );
}
