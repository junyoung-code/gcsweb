import Image from 'next/image';
import { formatWon } from '@/lib/utils';
import type { QrshopProduct } from '@/types/qrshop';

type QrshopProductCardProps = {
  product: QrshopProduct;
  optionNames?: string[];
  selected: boolean;
  soldOut?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export default function QrshopProductCard({ product, optionNames, selected, soldOut = false, disabled = false, onSelect }: QrshopProductCardProps) {
  const visibleOptionNames = optionNames?.filter((option): option is string => Boolean(option)) ?? (product.option ? [product.option] : []);

  return (
    <button type="button" disabled={disabled} aria-pressed={selected} aria-label={`${product.name} ${visibleOptionNames.join(' ')} ${soldOut ? '품절' : '담기'}`} className={`group flex min-w-0 flex-col overflow-hidden rounded-[4px] bg-neutral-1 text-left transition ${disabled ? 'cursor-default' : soldOut ? 'cursor-pointer' : 'active:scale-[0.98]'}`} onClick={onSelect}>
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
        <span className="typo-body-xsmall-bold block min-w-0 break-all whitespace-normal text-neutral-13">{product.name}</span>
        {visibleOptionNames.length ? (
          <span className="typo-body-xxsmall block min-w-0 break-all whitespace-normal text-neutral-7">
            {visibleOptionNames.map((option, index) => <span key={option}>{index ? ' • ' : ''}{option}</span>)}
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
