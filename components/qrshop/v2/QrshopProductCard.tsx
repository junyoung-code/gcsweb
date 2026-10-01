import Image from 'next/image';
import { formatWon } from '@/lib/utils';
import type { QrshopProduct } from '@/types/qrshop';

type QrshopProductCardProps = {
  product: QrshopProduct;
  optionNames?: string[];
  selected: boolean;
  soldOut?: boolean;
  onSelect: () => void;
};

export default function QrshopProductCard({ product, optionNames, selected, soldOut = false, onSelect }: QrshopProductCardProps) {
  const visibleOptionNames = optionNames?.filter((option): option is string => Boolean(option)) ?? (product.option ? [product.option] : []);
  const hasProductNameOverLimit = Array.from(product.name).length > 18;
  const hasOptionNameOverLimit = visibleOptionNames.some((option) => Array.from(option).length > 18);

  return (
    <button type="button" aria-pressed={selected} aria-label={`${product.name} ${visibleOptionNames.join(' ')} ${soldOut ? '품절' : '담기'}`} className={`group flex min-w-0 flex-col overflow-hidden rounded-[4px] bg-neutral-1 text-left transition ${soldOut ? 'cursor-pointer' : 'active:scale-[0.98]'}`} onClick={onSelect}>
      <span className={`relative block aspect-square w-full overflow-hidden rounded-t-[4px] ${product.imageUrl ? 'bg-neutral-4' : 'bg-orange-2'}`}>
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt="" fill sizes="(max-width: 430px) 46vw, 180px" className={`object-cover ${soldOut ? 'opacity-40' : ''}`} />
        ) : null}
        {soldOut ? (
          <span className="absolute right-[9px] top-[9px] flex size-[67px] items-center justify-center" aria-hidden="true">
            <Image src="/assets/qrshop/sold-out-badge.svg" alt="" fill sizes="67px" />
            <span className="relative typo-heading-small text-neutral-3">품절</span>
          </span>
        ) : null}
      </span>
      <span className="flex min-h-[75px] w-full flex-col px-3 pb-[9px] pt-[7px]">
        <span className="relative block min-w-0">
          <span className="typo-body-xsmall-bold block overflow-x-auto whitespace-nowrap text-neutral-13 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{product.name}</span>
          {hasProductNameOverLimit ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-3"
              style={{ background: 'linear-gradient(to right, rgb(255 255 255 / 0), #fff)' }}
            />
          ) : null}
        </span>
        {visibleOptionNames.length ? (
          <span className="relative block min-w-0">
            <span className="typo-body-xxsmall block overflow-x-auto whitespace-nowrap text-neutral-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleOptionNames.map((option, index) => <span key={option}>{index ? ' • ' : ''}{option}</span>)}
            </span>
            {hasOptionNameOverLimit ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-3"
                style={{ background: 'linear-gradient(to right, rgb(255 255 255 / 0), #fff)' }}
              />
            ) : null}
          </span>
        ) : <span className="typo-body-xxsmall text-neutral-7">단일 옵션</span>}
        <span className="mt-auto flex items-center justify-between gap-2">
          <span className="typo-body-xsmall-bold text-neutral-12">{formatWon(product.price)}</span>
          {!soldOut && selected ? (
            <span
              role="img"
              aria-label="장바구니에 담김"
              className="h-5 w-5 shrink-0 bg-orange-5"
              style={{
                WebkitMask: "url('/assets/icons/filled/Filled/Bag 3.svg') center / contain no-repeat",
                mask: "url('/assets/icons/filled/Filled/Bag 3.svg') center / contain no-repeat",
              }}
            />
          ) : null}
        </span>
      </span>
    </button>
  );
}
