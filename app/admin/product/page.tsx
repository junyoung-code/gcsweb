'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NavBar } from '@/components/layout';
import SearchBar from '@/components/ui/common/SearchBar';
import Productcard from '@/components/ui/admin/product/Productcard';
import Filter from '@/components/ui/admin/product/Filter';
import ToastMessage from '@/components/ui/common/ToastMessage';
import { formatDate, formatPrice } from '@/lib/utils';

type ProductType = 0 | 1 | 2;
type ProductTabKey = 'all' | 'fund' | 'buyNow' | 'partnerUp';

type AdminProductItem = {
  id: string;
  teamId: string;
  teamName: string;
  type: ProductType;
  name: string;
  description: string;
  thumbnailUrl: string;
  isHome: boolean;
  isPublic: boolean;
  salesStartDate: string | null;
  salesEndDate: string | null;
  currentAmount: number | null;
  goalAmount: number | null;
  likeCount: number;
  isLiked?: boolean;
};

type AdminProductListResponse = {
  status: 'success' | 'error';
  message?: string;
  data?: {
    products?: AdminProductItem[];
  };
};

const TAB_OPTIONS: Array<{ key: ProductTabKey; label: string; type: ProductType | null }> = [
  { key: 'all', label: '전체', type: null },
  { key: 'fund', label: 'Fund', type: 0 },
  { key: 'buyNow', label: 'Buy Now', type: 1 },
  { key: 'partnerUp', label: 'Partner Up', type: 2 },
];

function formatDateRange(start: string | null, end: string | null) {
  const startText = formatDate(start ?? undefined);
  const endText = formatDate(end ?? undefined);
  if (startText && endText) return `${startText} - ${endText}`;
  if (startText) return `${startText} -`;
  if (endText) return `- ${endText}`;
  return '-';
}

function calcProgressPercent(currentAmount: number | null, goalAmount: number | null) {
  const current = typeof currentAmount === 'number' ? currentAmount : 0;
  const goal = typeof goalAmount === 'number' ? goalAmount : 0;
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / goal) * 100)));
}

export default function AdminProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ProductTabKey>('all');
  const [products, setProducts] = useState<AdminProductItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const toast = searchParams.get('toast');
    if (toast === 'updated') {
      setToastMessage('상품글이 수정되었습니다.');
      router.replace('/admin/product');
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/v1/admin/product/list', { cache: 'no-store' });
        const json = (await res.json().catch(() => ({}))) as AdminProductListResponse;

        if (!res.ok || json.status !== 'success') {
          throw new Error(json.message ?? '상품글 목록을 불러오지 못했습니다.');
        }

        if (cancelled) return;

        setProducts((json.data?.products ?? []) as AdminProductItem[]);
        setErrorMessage(null);
      } catch (error: any) {
        console.error(error);
        if (!cancelled) {
          setProducts([]);
          setErrorMessage(error?.message ?? '상품글 목록을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const selectedType = TAB_OPTIONS.find((tab) => tab.key === activeTab)?.type ?? null;
    const keyword = search.trim().toLowerCase();

    return products.filter((product) => {
      if (selectedType !== null && product.type !== selectedType) return false;
      if (!keyword) return true;

      const name = String(product.name ?? '').toLowerCase();
      const teamName = String(product.teamName ?? '').toLowerCase();
      return name.includes(keyword) || teamName.includes(keyword);
    });
  }, [activeTab, products, search]);

  const updateProductFlag = async (productId: string, key: 'isHome' | 'isPublic', value: boolean) => {
    setProducts((prev) => prev.map((item) => (item.id === productId ? { ...item, [key]: value } : item)));

    try {
      const res = await fetch(`/api/v1/admin/product/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message ?? '상태를 업데이트하지 못했습니다.');
      }
    } catch (error) {
      console.error('Failed to update product flag:', error);
      setProducts((prev) => prev.map((item) => (item.id === productId ? { ...item, [key]: !value } : item)));
    }
  };

  const updateProductLike = async (productId: string) => {
    setProducts((prev) =>
      prev.map((item) =>
        item.id === productId
          ? {
              ...item,
              isLiked: !item.isLiked,
              likeCount: !item.isLiked ? (item.likeCount ?? 0) + 1 : Math.max(0, (item.likeCount ?? 0) - 1),
            }
          : item
      )
    );

    try {
      const res = await fetch(`/api/v1/shop/products/${productId}/like`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message ?? '좋아요 상태를 변경하지 못했습니다.');
      }

      const isLiked = json.data?.isLiked;
      if (isLiked !== undefined) {
        setProducts((prev) =>
          prev.map((item) =>
            item.id === productId ? { ...item, isLiked } : item
          )
        );
      }
    } catch (error: any) {
      console.error('Failed to update product like:', error);
      setProducts((prev) =>
        prev.map((item) =>
          item.id === productId
            ? {
                ...item,
                isLiked: !item.isLiked,
                likeCount: item.isLiked ? (item.likeCount ?? 0) + 1 : Math.max(0, (item.likeCount ?? 0) - 1),
              }
            : item
        )
      );
      alert(error.message || '요청 처리에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-3 font-pretendard">
      <div className="mx-auto w-full max-w-[375px] bg-neutral-3 relative">
        {toastMessage ? (
          <div className="pointer-events-none fixed left-0 right-0 top-[34px] z-50 mx-auto w-full max-w-[375px] px-4">
            <ToastMessage message={toastMessage} />
          </div>
        ) : null}

        <NavBar variant="title-back" title="상품글 관리" onBack={() => router.push('/admin')} />

        <main className="pb-8">
          <div className="mt-[19px] px-4">
            <SearchBar
              placeholder="상품명, 팀명으로 검색..."
              value={search}
              onChange={setSearch}
            />
          </div>

          <section className="mt-4 px-4">
            <div className="flex flex-wrap items-center gap-2">
              {TAB_OPTIONS.map((tab) => (
                <Filter
                  key={tab.key}
                  label={tab.label}
                  selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                />
              ))}
            </div>

            {listLoading ? (
              <div className="flex min-h-[calc(100vh-220px)] items-center justify-center px-4 text-center">
                <p className="typo-body-small text-neutral-8">상품글 목록 로딩 중...</p>
              </div>
            ) : errorMessage ? (
              <div className="flex min-h-[calc(100vh-220px)] items-center justify-center px-4 text-center">
                <p className="typo-body-small text-red-5">{errorMessage}</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex min-h-[calc(100vh-220px)] items-center justify-center px-4 text-center">
                <p className="typo-heading-small text-neutral-12">등록된 상품글이 없습니다.</p>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-5 pb-6">
                {filteredProducts.map((product) => {
                  const isFund = product.type === 0;
                  const progressPercent = isFund
                    ? calcProgressPercent(product.currentAmount, product.goalAmount)
                    : undefined;

                  return (
                    <Productcard
                      key={product.id}
                      className="w-full"
                      view="admin"
                      type={isFund ? 'fund' : 'buynow/partnerup'}
                      imageSrc={product.thumbnailUrl || undefined}
                      brand={product.teamName || '팀명'}
                      title={product.name || '상품명'}
                      description={product.description || ''}
                      periodText={formatDateRange(product.salesStartDate, product.salesEndDate)}
                      achievedAmountText={isFund ? formatPrice(product.currentAmount) : undefined}
                      totalAmountText={isFund ? formatPrice(product.goalAmount) : undefined}
                      progressPercent={progressPercent}
                      likeCount={Number(product.likeCount ?? 0)}
                      liked={Boolean(product.isLiked)}
                      onLikeClick={() => updateProductLike(product.id)}
                      homeExpose={Boolean(product.isHome)}
                      publicChecked={Boolean(product.isPublic)}
                      onHomeExposeChange={(checked) => updateProductFlag(product.id, 'isHome', checked)}
                      onPublicChange={(checked) => updateProductFlag(product.id, 'isPublic', checked)}
                      onCardClick={() => router.push(`/admin/product/${product.id}/edit`)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
