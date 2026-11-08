import Image from 'next/image';
import Link from 'next/link';
import type { SellerSummary } from '@/types/sales-management';

type SalesManagementLandingProps =
  | { status: 'loading' }
  | { status: 'error'; errorMessage?: string }
  | { status: 'ready'; summary: SellerSummary };

const actionLinkClassName =
  'inline-flex h-[50px] w-full max-w-[238px] items-center justify-center rounded-[4px] bg-orange-5 px-4 text-center text-neutral-2 typo-body-large-bold transition-colors hover:bg-orange-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-7 focus-visible:ring-offset-2';

function LandingLoading() {
  return (
    <div
      role="status"
      aria-label="판매 관리 정보를 불러오는 중"
      className="mx-auto max-w-[1185px] space-y-6 py-6 md:space-y-[63px] md:py-[38px]"
    >
      <div className="flex min-h-[299px] animate-pulse items-center rounded-xl bg-neutral-1 px-8 md:px-[45px]">
        <div className="h-[160px] w-[160px] shrink-0 rounded-md bg-neutral-5 md:h-[198px] md:w-[200px]" />
        <div className="ml-7 hidden space-y-3 md:block">
          <div className="h-8 w-28 rounded bg-neutral-5" />
          <div className="h-6 w-40 rounded bg-neutral-4" />
        </div>
      </div>
      <div className="flex min-h-[372px] animate-pulse flex-col items-center justify-center rounded-xl bg-neutral-1 px-8">
        <div className="h-8 w-72 max-w-full rounded bg-neutral-5" />
        <div className="mt-6 h-[50px] w-[238px] max-w-full rounded bg-orange-3" />
      </div>
      <span className="sr-only">로딩 중</span>
    </div>
  );
}

function LandingError({ errorMessage }: { errorMessage?: string }) {
  return (
    <div className="mx-auto max-w-[1185px] py-6 md:py-[38px]">
      <section className="flex min-h-[406px] flex-col items-center justify-center rounded-xl bg-neutral-1 px-8 text-center">
        <h2 className="text-neutral-7 typo-heading-medium">
          판매 관리 정보를 불러오지 못했어요.
        </h2>
        <p className="mt-2 text-neutral-7 typo-body-small">
          {errorMessage ?? '잠시 후 다시 시도해주세요.'}
        </p>
        <Link href="/sales-management" className={`${actionLinkClassName} mt-6`}>
          다시 불러오기
        </Link>
      </section>
    </div>
  );
}

function EmptyStorePanel() {
  return (
    <section
      aria-labelledby="empty-store-title"
      className="flex min-h-[320px] flex-col items-center justify-center rounded-xl bg-neutral-1 px-8 text-center md:min-h-[406px]"
    >
      <h2 id="empty-store-title" className="text-neutral-7 typo-heading-medium">
        아직 상점이 등록되지 않았어요!
      </h2>
      <Link href="/sales-management/store" className={`${actionLinkClassName} mt-6`}>
        내 상점 등록하러가기
      </Link>
    </section>
  );
}

function StorePanel({ summary }: { summary: SellerSummary }) {
  const store = summary.store;

  if (store === null) return <EmptyStorePanel />;

  return (
    <section
      aria-labelledby="store-name"
      className="flex min-h-[299px] flex-col items-center justify-center gap-7 rounded-xl bg-neutral-1 px-8 py-10 text-center md:flex-row md:justify-start md:gap-[38px] md:px-[45px] md:py-0 md:text-left"
    >
      <div className="relative h-[198px] w-[200px] shrink-0 overflow-hidden bg-neutral-5">
        {store.imageUrl ? (
          <Image
            src={store.imageUrl}
            alt={`${store.name} 상점 이미지`}
            fill
            sizes="200px"
            className="object-cover"
          />
        ) : null}
      </div>
      <div className="md:self-stretch md:pt-[56px]">
        <h2 id="store-name" className="text-neutral-7 typo-heading-xlarge">
          {store.name}
        </h2>
        {store.description ? (
          <p className="mt-[9px] text-neutral-7 typo-body-large">{store.description}</p>
        ) : null}
      </div>
    </section>
  );
}

function ProductPanel({ summary }: { summary: SellerSummary }) {
  const hasStore = summary.store !== null;
  const hasProducts = summary.productCount > 0;
  const storeName = summary.store?.name;

  const title = hasProducts
    ? `${storeName}의 상품 ${summary.productCount}개를 관리해보세요.`
    : hasStore
      ? `${storeName}님 이제 상품을 등록하러 가볼까요?`
      : '아직 상품이 등록되지 않았어요!';

  return (
    <section
      aria-labelledby="product-panel-title"
      className="flex min-h-[320px] flex-col items-center justify-center rounded-xl bg-neutral-1 px-8 text-center md:min-h-[372px]"
    >
      <div
        className={hasStore ? 'md:-translate-y-2' : 'md:-translate-y-4'}
      >
        <h2 id="product-panel-title" className="text-neutral-7 typo-heading-medium">
          {title}
        </h2>
        <Link href="/sales-management/products" className={`${actionLinkClassName} mt-6`}>
          {hasProducts ? '내 상품 관리하러가기' : '내 상품 등록하러가기'}
        </Link>
        {!hasStore ? (
          <p className="mt-2 text-neutral-7 typo-body-small">
            상점 등록 후 상품을 등록해주세요.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default function SalesManagementLanding(props: SalesManagementLandingProps) {
  if (props.status === 'loading') return <LandingLoading />;
  if (props.status === 'error') {
    return <LandingError errorMessage={props.errorMessage} />;
  }

  return (
    <div
      className={
        props.summary.store
          ? 'mx-auto max-w-[1185px] space-y-6 py-6 md:space-y-[63px] md:py-[38px]'
          : 'mx-auto max-w-[1185px] space-y-6 py-6 md:space-y-[39px] md:py-0'
      }
    >
      <StorePanel summary={props.summary} />
      <ProductPanel summary={props.summary} />
    </div>
  );
}
