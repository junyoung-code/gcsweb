'use client';

import Button from '@/components/ui/button/Button';

type Props = { productName: string; onConfirm: () => void };

export default function QrshopSoldOutModal({ productName, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="qrshop-soldout-title" className="w-full max-w-[343px] rounded-[12px] bg-white px-[21px] pb-8 pt-7 text-center">
        <h2 id="qrshop-soldout-title" className="typo-heading-xsmall text-black">{productName}이 품절되었습니다.</h2>
        <p className="mt-2 typo-body-xsmall text-neutral-8">품절된 상품은 자동으로 결제 목록에서 제외됩니다.</p>
        <Button color="orange" size="s" className="mt-[21px] h-[35px] rounded-[4px]" onClick={onConfirm}>확인</Button>
      </section>
    </div>
  );
}
