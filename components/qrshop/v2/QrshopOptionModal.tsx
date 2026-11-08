'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/button/Button';
import { formatWon } from '@/lib/utils';
import type { QrshopProduct } from '@/types/qrshop';

type Props = {
  products: QrshopProduct[];
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => void;
};

export default function QrshopOptionModal({ products, selectedIds, onClose, onConfirm }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState(() => selectedIds.filter((id) => products.some((product) => product.id === id && !product.soldOut)));
  const availableDraft = draft.filter((id) => products.some((product) => product.id === id && !product.soldOut));
  const basePrice = products[0]?.basePrice ?? Math.min(...products.map((product) => product.price));

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    (dialog?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? dialog)?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const buttons = dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (!dialog.contains(document.activeElement) || document.activeElement === dialog || document.activeElement === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggle = (product: QrshopProduct) => {
    if (product.soldOut) return;
    setDraft((current) => current.includes(product.id)
      ? current.filter((id) => id !== product.id)
      : [...current, product.id]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="qrshop-option-title" className="w-full max-w-[343px] rounded-[12px] bg-white px-[21px] pb-8 pt-7">
        <header className="text-center">
          <h2 id="qrshop-option-title" className="typo-heading-xsmall break-words text-black">{products[0]?.name}</h2>
          <p className="mt-0.5 typo-body-xsmall text-neutral-8">옵션은 복수선택 가능합니다.</p>
        </header>
        <div className="mt-[17px] max-h-[268px] space-y-2 overflow-y-auto">
          {products.map((product) => {
            const selected = availableDraft.includes(product.id);
            const checkMask = `url('/assets/icons/${selected ? 'filled/Filled/Check.svg' : 'light/check.svg'}') center / contain no-repeat`;
            const additionalPrice = product.price - basePrice;
            return (
              <button
                key={product.id}
                type="button"
                disabled={product.soldOut}
                aria-pressed={selected}
                className={`flex h-[43px] w-full items-center gap-2 rounded-[4px] border bg-white px-4 text-left typo-body-small focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-5 disabled:cursor-default ${selected ? 'border-orange-4 text-neutral-11' : 'border-neutral-5 text-neutral-7'}`}
                onClick={() => toggle(product)}
              >
                <span className="min-w-0 flex-1 truncate">{product.option ?? '옵션 없음'}</span>
                {product.soldOut ? <span className="shrink-0 text-orange-5">품절</span> : null}
                {!product.soldOut && additionalPrice > 0 ? <span className="shrink-0">+ {formatWon(additionalPrice)}</span> : null}
                {!product.soldOut ? (
                  <span aria-hidden className={`h-5 w-5 shrink-0 ${selected ? 'bg-orange-5' : 'bg-neutral-6'}`} style={{ mask: checkMask, WebkitMask: checkMask }} />
                ) : null}
              </button>
            );
          })}
        </div>
        <Button color="orange" size="s" status={availableDraft.length ? 'default' : 'disabled'} disabled={!availableDraft.length} className="mt-[21px] h-[35px] rounded-[4px]" onClick={() => onConfirm(availableDraft)}>완료</Button>
      </section>
    </div>
  );
}
