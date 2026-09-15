import Image from 'next/image';
import { formatWon } from '@/lib/utils';
import type { QrshopProduct } from '@/types/qrshop';

type QrshopProductCardProps = { product: QrshopProduct; selected: boolean; onSelect: () => void };

export default function QrshopProductCard({ product, selected, onSelect }: QrshopProductCardProps) {
  return (
    <button type="button" aria-pressed={selected} aria-label={`${product.name} ${product.option ?? ''} 담기`} className="group flex min-w-0 flex-col overflow-hidden rounded-[4px] bg-neutral-1 text-left transition active:scale-[0.98]" onClick={onSelect}>
      <span className="relative block aspect-square w-full overflow-hidden rounded-t-[4px] bg-neutral-4">
        <Image src={product.imageUrl ?? '/assets/qrshop/product-placeholder.png'} alt="" fill sizes="(max-width: 430px) 46vw, 180px" className="object-cover" />
      </span>
      <span className="flex h-[75px] w-full flex-col px-3 pb-[9px] pt-[7px]">
        <span className="typo-body-xsmall-bold truncate text-neutral-13">{product.name}</span>
        <span className="typo-body-xxsmall truncate text-neutral-7">{product.option ?? '단일 옵션'}</span>
        <span className="mt-auto flex items-center justify-between gap-2">
          <span className="typo-body-xsmall-bold text-neutral-12">{formatWon(product.price)}</span>
          {selected ? (
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
