'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BottomTabBar, NavBar } from '@/components/layout';
import Modal from '@/components/ui/common/Modal';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatPrice } from '@/lib/utils';

const heroImage = '/assets/images/poster.svg';
const instagramIcon = '/assets/icons/icon-instagram-line.svg';

type HomeBuyNowProduct = {
  id: string;
  name: string;
  teamName: string;
  salesEndDate: string;
  thumbnailUrl: string;
};

type HomeFundProduct = {
  id: string;
  name: string;
  teamName: string;
  salesEndDate: string;
  currentAmount: number;
  goalAmount: number;
  thumbnailUrl: string;
};

function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5">
      <span className="typo-heading-xsmall text-orange-4">{title}</span>
      <Image
        src="/assets/icons/arrow/filled/Iconex/Filled/Right 2.svg"
        alt=""
        width={22}
        height={22}
        className="[filter:brightness(0)_saturate(100%)_invert(64%)_sepia(65%)_saturate(1452%)_hue-rotate(331deg)_brightness(102%)_contrast(93%)]"
        aria-hidden
      />
    </Link>
  );
}

function ProductCard({
  image,
  title,
  subtitle,
  badge,
  onClick,
}: {
  image: string;
  title: string;
  subtitle: string;
  badge: string;
  onClick?: () => void;
}) {
  return (
    <article className={`w-[269px] shrink-0 ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={title} className="aspect-[1080/1350] w-full rounded-[8px] object-cover shadow-[0_0_5px_0_rgba(0,0,0,0.2)]" />
      <div className="mt-4 flex flex-col gap-2">
        <span className="inline-flex h-[20px] w-fit items-center rounded-[4px] bg-neutral-5 px-[5px] text-[13px] tracking-[-0.26px] text-neutral-9">
          {badge}
        </span>
        <div className="h-px w-full bg-neutral-4" />
        <div className="pt-1">
          <p className="typo-heading-xsmall text-neutral-12">{title}</p>
          <p className="typo-body-small text-neutral-8">{subtitle}</p>
        </div>
      </div>
    </article>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [buyNowProducts, setBuyNowProducts] = useState<HomeBuyNowProduct[]>([]);
  const [buyNowIndex, setBuyNowIndex] = useState(0);
  const [isBuyNowAnimating, setIsBuyNowAnimating] = useState(false);
  const [buyNowDirection, setBuyNowDirection] = useState<1 | -1>(1);
  const [fundProducts, setFundProducts] = useState<HomeFundProduct[]>([]);
  const [fundIndex, setFundIndex] = useState(0);
  const [isFundAnimating, setIsFundAnimating] = useState(false);
  const [fundDirection, setFundDirection] = useState<1 | -1>(1);
  const isRestockModalOpen = searchParams.get('restock') === '1';

  const handleRestockSignup = () => {
    router.push('/login?from=restock');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/home/buynow', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || json?.status !== 'success') {
          setBuyNowProducts([]);
          return;
        }
        const rows = (json?.data?.products ?? []) as HomeBuyNowProduct[];
        setBuyNowProducts(rows);
      } catch {
        if (cancelled) return;
        setBuyNowProducts([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/home/fund', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || json?.status !== 'success') {
          setFundProducts([]);
          return;
        }
        const rows = (json?.data?.products ?? []) as HomeFundProduct[];
        setFundProducts(rows);
      } catch {
        if (cancelled) return;
        setFundProducts([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (buyNowProducts.length <= 1) return;
    const timer = setInterval(() => {
      moveBuyNow(1);
    }, 6500);
    return () => clearInterval(timer);
  }, [buyNowProducts.length, isBuyNowAnimating]);

  useEffect(() => {
    if (fundProducts.length <= 1) return;
    const timer = setInterval(() => {
      moveFund(1);
    }, 6500);
    return () => clearInterval(timer);
  }, [fundProducts.length, isFundAnimating]);

  useEffect(() => {
    if (buyNowProducts.length === 0) return;
    buyNowProducts.forEach((product) => {
      if (!product.thumbnailUrl) return;
      const preloadedImage = new window.Image();
      preloadedImage.src = product.thumbnailUrl;
    });
  }, [buyNowProducts]);

  useEffect(() => {
    if (fundProducts.length === 0) return;
    fundProducts.forEach((product) => {
      if (!product.thumbnailUrl) return;
      const preloadedImage = new window.Image();
      preloadedImage.src = product.thumbnailUrl;
    });
  }, [fundProducts]);

  useEffect(() => {
    if (buyNowProducts.length === 0 && buyNowIndex !== 0) {
      setBuyNowIndex(0);
      return;
    }
    if (buyNowIndex >= buyNowProducts.length && buyNowProducts.length > 0) {
      setBuyNowIndex(0);
    }
  }, [buyNowIndex, buyNowProducts.length]);

  useEffect(() => {
    if (fundProducts.length === 0 && fundIndex !== 0) {
      setFundIndex(0);
      return;
    }
    if (fundIndex >= fundProducts.length && fundProducts.length > 0) {
      setFundIndex(0);
    }
  }, [fundIndex, fundProducts.length]);

  const getDDayBadge = (product: { salesEndDate: string } | null) => {
    if (!product) return 'D-0';
    const end = new Date(product.salesEndDate);
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return diffDays === 0 ? 'D-day' : `D-${diffDays}`;
  };

  const activeBuyNow = buyNowProducts[buyNowIndex] ?? null;
  const leftBuyNow =
    buyNowProducts.length > 0
      ? buyNowProducts[(buyNowIndex - 1 + buyNowProducts.length) % buyNowProducts.length]
      : null;
  const rightBuyNow =
    buyNowProducts.length > 0
      ? buyNowProducts[(buyNowIndex + 1) % buyNowProducts.length]
      : null;

  const moveBuyNow = (dir: -1 | 1) => {
    if (buyNowProducts.length <= 1 || isBuyNowAnimating) return;
    setBuyNowDirection(dir);
    setIsBuyNowAnimating(true);
    window.setTimeout(() => {
      setBuyNowIndex((prev) => (prev + dir + buyNowProducts.length) % buyNowProducts.length);
      setIsBuyNowAnimating(false);
    }, 420);
  };

  const activeFund = fundProducts[fundIndex] ?? null;
  const leftFund =
    fundProducts.length > 0
      ? fundProducts[(fundIndex - 1 + fundProducts.length) % fundProducts.length]
      : null;
  const rightFund =
    fundProducts.length > 0
      ? fundProducts[(fundIndex + 1) % fundProducts.length]
      : null;

  const moveFund = (dir: -1 | 1) => {
    if (fundProducts.length <= 1 || isFundAnimating) return;
    setFundDirection(dir);
    setIsFundAnimating(true);
    window.setTimeout(() => {
      setFundIndex((prev) => (prev + dir + fundProducts.length) % fundProducts.length);
      setIsFundAnimating(false);
    }, 420);
  };

  const fundPercent =
    activeFund && activeFund.goalAmount > 0
      ? Math.max(0, Math.min(100, Math.round((activeFund.currentAmount / activeFund.goalAmount) * 100)))
      : 0;
  const fundStatusLabel = fundPercent >= 100 ? '달성' : '미달성';
  const fundAmountLabel = formatPrice(activeFund?.currentAmount ?? 0);

  return (
    <div className="min-h-screen bg-neutral-3">
      <div className="mx-auto flex min-h-screen w-full max-w-[375px] flex-col bg-neutral-3">
        <NavBar />

        <main className="flex-1">
          <section className="px-4 pt-[18px]">
            <p className="typo-body-small text-orange-5">2026 불교박람회</p>
            <h1 className="mt-1 text-[24px] font-bold leading-[1.5] text-orange-5">이번 역은 열반, 열반역 입니다람쥐. (0928 테스트)</h1>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage}
              alt="열반급행 메인 포스터"
              className="mt-5 h-[429px] w-full rounded-[8px] object-cover shadow-[0_0_5px_0_rgba(0,0,0,0.2)]"
            />

            <a
              href="https://www.instagram.com/nirvana.express?igsh=dnBzdnAwbXlhb3Rw/"
              target="_blank"
              rel="noreferrer"
              className="mx-auto mb-8 mt-[19px] flex h-[29px] w-fit items-center gap-1 rounded-[5px] border border-orange-3 bg-neutral-2 px-2 text-[15px] text-neutral-8"
            >
              열반급행 부스를 확인해보세요!
              <Image src={instagramIcon} alt="" width={22} height={22} />
            </a>
          </section>

          {buyNowProducts.length > 0 ? (
            <>
              <div className="mb-2 bg-neutral-3 px-4 pt-4">
                <SectionTitle title="Buy Now" href="/shop?type=buyNow" />
              </div>
              <section className="bg-neutral-2 px-4 pb-7 pt-6">
            <div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-label="이전"
                  className={`inline-flex h-6 w-6 items-center justify-center ${
                    buyNowProducts.length === 0 ? 'text-neutral-6' : 'text-orange-3'
                  }`}
                  onClick={() => moveBuyNow(-1)}
                  disabled={buyNowProducts.length <= 1 || isBuyNowAnimating}
                >
                  <span className="text-[28px] leading-none">{'‹'}</span>
                </button>

                {activeBuyNow ? (
                  <div className="w-[269px] overflow-hidden">
                    <div
                      className="flex will-change-transform"
                      style={{
                        transform: isBuyNowAnimating
                          ? `translateX(${buyNowDirection === 1 ? -538 : 0}px)`
                          : 'translateX(-269px)',
                        transition: isBuyNowAnimating ? 'transform 420ms ease' : 'none',
                      }}
                    >
                      <ProductCard
                        image={leftBuyNow?.thumbnailUrl ?? ''}
                        badge={getDDayBadge(leftBuyNow)}
                        title={leftBuyNow?.name ?? ''}
                        subtitle={leftBuyNow?.teamName ?? ''}
                      />
                      <ProductCard
                        image={activeBuyNow.thumbnailUrl}
                        badge={getDDayBadge(activeBuyNow)}
                        title={activeBuyNow.name}
                        subtitle={activeBuyNow.teamName}
                        onClick={() => router.push(`/shop/${activeBuyNow.id}`)}
                      />
                      <ProductCard
                        image={rightBuyNow?.thumbnailUrl ?? ''}
                        badge={getDDayBadge(rightBuyNow)}
                        title={rightBuyNow?.name ?? ''}
                        subtitle={rightBuyNow?.teamName ?? ''}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-[269px] rounded-[8px] bg-neutral-2 py-16 text-center">
                    <p className="typo-body-small text-neutral-7">홈에 노출된 Buy Now 상품이 없습니다.</p>
                  </div>
                )}

                <button
                  type="button"
                  aria-label="다음"
                  className={`inline-flex h-6 w-6 items-center justify-center ${
                    buyNowProducts.length === 0 ? 'text-neutral-6' : 'text-orange-3'
                  }`}
                  onClick={() => moveBuyNow(1)}
                  disabled={buyNowProducts.length <= 1 || isBuyNowAnimating}
                >
                  <span className="text-[28px] leading-none">{'›'}</span>
                </button>
              </div>
            </div>
              </section>
            </>
          ) : null}

          {fundProducts.length > 0 ? (
            <>
              <div className="mb-2 bg-neutral-3 px-4 pt-4">
                <SectionTitle title="Fund" href="/shop?type=fund" />
              </div>
              <section className="bg-neutral-2 px-4 pb-7 pt-6">
            <div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-label="이전"
                  className={`inline-flex h-6 w-6 items-center justify-center ${
                    fundProducts.length === 0 ? 'text-neutral-6' : 'text-orange-3'
                  }`}
                  onClick={() => moveFund(-1)}
                  disabled={fundProducts.length <= 1 || isFundAnimating}
                >
                  <span className="text-[28px] leading-none">{'‹'}</span>
                </button>

                {activeFund ? (
                  <div className="w-[269px] overflow-hidden">
                    <div
                      className="flex will-change-transform"
                      style={{
                        transform: isFundAnimating
                          ? `translateX(${fundDirection === 1 ? -538 : 0}px)`
                          : 'translateX(-269px)',
                        transition: isFundAnimating ? 'transform 420ms ease' : 'none',
                      }}
                    >
                      <ProductCard
                        image={leftFund?.thumbnailUrl ?? ''}
                        badge={getDDayBadge(leftFund)}
                        title={leftFund?.name ?? ''}
                        subtitle={leftFund?.teamName ?? ''}
                      />
                      <ProductCard
                        image={activeFund.thumbnailUrl}
                        badge={getDDayBadge(activeFund)}
                        title={activeFund.name}
                        subtitle={activeFund.teamName}
                        onClick={() => router.push(`/shop/${activeFund.id}`)}
                      />
                      <ProductCard
                        image={rightFund?.thumbnailUrl ?? ''}
                        badge={getDDayBadge(rightFund)}
                        title={rightFund?.name ?? ''}
                        subtitle={rightFund?.teamName ?? ''}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-[269px] rounded-[8px] bg-neutral-2 py-16 text-center">
                    <p className="typo-body-small text-neutral-7">홈에 노출된 Fund 상품이 없습니다.</p>
                  </div>
                )}

                <button
                  type="button"
                  aria-label="다음"
                  className={`inline-flex h-6 w-6 items-center justify-center ${
                    fundProducts.length === 0 ? 'text-neutral-6' : 'text-orange-3'
                  }`}
                  onClick={() => moveFund(1)}
                  disabled={fundProducts.length <= 1 || isFundAnimating}
                >
                  <span className="text-[28px] leading-none">{'›'}</span>
                </button>
              </div>
              <div className="mx-auto mt-3 w-[269px]">
                <div className="mb-[10px] flex items-center justify-between text-[13px] text-neutral-8 tracking-[-0.26px]">
                  <div className="flex items-center gap-[6px]">
                    <span className="inline-flex h-[17px] items-center rounded-[4px] bg-neutral-5 px-[5px] text-[11px] text-neutral-9">{fundStatusLabel}</span>
                    <span>{fundPercent}%</span>
                  </div>
                  <span>{fundAmountLabel}</span>
                </div>
                <div className="h-[7px] rounded-[3.5px] border border-neutral-5 bg-[#f8f6f4]">
                  <div className="h-full rounded-[3.5px] bg-[#efddc9]" style={{ width: `${fundPercent}%` }} />
                </div>
              </div>
            </div>
              </section>
            </>
          ) : null}
        </main>

        <div className="sticky bottom-0 z-20 mt-auto">
          <BottomTabBar variant="home" />
        </div>
      </div>

      {isRestockModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.23)] px-4">
          <div onClick={(event) => event.stopPropagation()}>
            <Modal
              variant="one button"
              className="shadow-[0px_1px_2px_0px_rgba(99,81,73,0.1)]"
              title={'회원가입 시 재입고 알림을 받을 수 있어요!'}
              confirmText={'회원가입하기'}
              onConfirm={handleRestockSignup}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HomeFallback() {
  return (
    <div className="min-h-screen bg-neutral-3">
      <div className="mx-auto flex min-h-screen w-full max-w-[375px] flex-col bg-neutral-3">
        <NavBar />
        <main className="flex-1" />
        <div className="sticky bottom-0 z-20 mt-auto">
          <BottomTabBar variant="home" />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
