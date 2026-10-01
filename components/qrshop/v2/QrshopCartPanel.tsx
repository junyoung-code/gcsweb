'use client';

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Button from '@/components/ui/button/Button';
import { formatWon } from '@/lib/utils';
import type { QrshopCartLine } from '@/types/qrshop';

const HANDLE_HEIGHT = 26;
const COLLAPSE_THRESHOLD = 80;

type Props = {
  lines: QrshopCartLine[]; agreed: boolean; submitting: boolean; error: string | null;
  onAgreementChange: (value: boolean) => void;
  onQuantityChange: (productId: string, next: number) => void; onRemove: (productId: string) => void; onSubmit: () => void;
};

export default function QrshopCartPanel(props: Props) {
  const { lines, agreed, submitting, error } = props;
  const listPanelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ pointerId: -1, startY: 0, startHeight: 0, currentHeight: 0, expandedHeight: 0, moved: false });
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const canSubmit = Boolean(lines.length && agreed && !submitting);

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = listPanelRef.current;
    if (!panel) return;
    const startHeight = panel.offsetHeight;
    const expandedHeight = Math.max(panel.scrollHeight, startHeight);
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight, currentHeight: startHeight, expandedHeight, moved: false };
    setDragHeight(startHeight);
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    const delta = event.clientY - dragRef.current.startY;
    const nextHeight = Math.min(dragRef.current.expandedHeight, Math.max(HANDLE_HEIGHT, dragRef.current.startHeight - delta));
    dragRef.current.currentHeight = nextHeight;
    dragRef.current.moved ||= Math.abs(delta) > 4;
    setDragHeight(nextHeight);
  };

  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    const distance = dragRef.current.startHeight - dragRef.current.currentHeight;
    if (dragRef.current.moved) {
      setCollapsed(collapsed ? distance >= -COLLAPSE_THRESHOLD : distance > COLLAPSE_THRESHOLD);
    }
    setDragging(false);
    setDragHeight(null);
    dragRef.current.pointerId = -1;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    setDragging(false);
    setDragHeight(null);
    dragRef.current.pointerId = -1;
  };

  return (
    <section
      aria-label="주문 정보"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-h-[calc(100dvh-129px)] w-full max-w-[430px] flex-col overflow-hidden bg-white shadow-[0_0_5px_rgba(0,0,0,0.1)]"
    >
      {lines.length > 0 ? (
        <div
          ref={listPanelRef}
          className={`flex min-h-0 flex-col overflow-hidden transition-[height] duration-100 ease-out ${dragging ? 'shrink-0' : collapsed ? 'shrink-0' : 'flex-1'}`}
          style={{ height: dragging ? `${dragHeight ?? HANDLE_HEIGHT}px` : collapsed ? `${HANDLE_HEIGHT}px` : undefined }}
        >
          <button
            type="button"
            aria-label={collapsed ? '주문 정보 펼치기' : '주문 정보 접기'}
            aria-expanded={!collapsed}
            className="flex h-[26px] w-full shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
            onClick={() => { if (!dragRef.current.moved) setCollapsed((current) => !current); dragRef.current.moved = false; }}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
          >
            <span aria-hidden className="h-1 w-10 rounded-full bg-neutral-5" />
          </button>
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-[11px]">
            <ul aria-label="선택 상품 목록" className="mb-[10px] max-h-[512px] shrink-0 space-y-[10px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {lines.map((line) => (
                <li key={line.productId} className="rounded-[4px] bg-[#f2f4f6] px-[14px] py-[11px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="typo-body-xsmall-bold truncate text-neutral-12">{line.productName}</p><p className="typo-body-xxsmall truncate text-neutral-7">{line.option ?? '단일 옵션'}</p></div>
                    <button type="button" className="h-5 w-5 text-xl leading-none text-neutral-6" aria-label={`${line.productName} 삭제`} onClick={() => props.onRemove(line.productId)}>×</button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="typo-body-xsmall-bold text-neutral-12">{formatWon(line.unitPrice)}</span>
                    <div className="flex items-center gap-[13px]">
                      <button type="button" className="flex h-6 w-6 items-center justify-center rounded-[5px] border border-neutral-6 typo-body-small text-neutral-12 disabled:text-neutral-6" aria-label={`${line.productName} 수량 감소`} disabled={line.quantity <= 1} onClick={() => props.onQuantityChange(line.productId, line.quantity - 1)}>−</button>
                      <span className="w-3 text-center typo-body-xsmall-bold text-neutral-12">{line.quantity}</span>
                      <button type="button" className="flex h-6 w-6 items-center justify-center rounded-[5px] border border-neutral-6 typo-body-small text-neutral-12 disabled:text-neutral-6" aria-label={`${line.productName} 수량 증가`} disabled={line.quantity >= 99} onClick={() => props.onQuantityChange(line.productId, line.quantity + 1)}>+</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <div className="shrink-0 bg-white px-4 pt-[11px]" style={{ paddingBottom: 'max(34px, env(safe-area-inset-bottom))' }}>
      <div className="flex items-center justify-between typo-body-small-bold"><span className="text-neutral-12">결제 금액</span><span className="text-orange-6">{formatWon(total)}</span></div>
      <div className="mt-[10px] flex items-center gap-[5px] typo-body-xxsmall text-neutral-7">
        <input id="qrshop-v2-agreement" type="checkbox" checked={agreed} disabled={lines.length === 0} onChange={(event) => props.onAgreementChange(event.target.checked)} className="h-[13px] w-[13px] rounded accent-orange-5" />
        <label htmlFor="qrshop-v2-agreement" className="cursor-pointer">결제 시, 쇼핑몰 이용약관 및 결제에 동의합니다.</label>
        <Link href="/terms/terms-of-service" aria-label="쇼핑몰 이용약관 보기" className="-ml-1 flex h-[13px] w-[13px] shrink-0 items-center justify-center">
          <Image src="/assets/icons/additional/Additional/Right-filled.svg" alt="" width={13} height={13} className="opacity-50" />
        </Link>
      </div>
      {error ? <p role="alert" className="mt-2 typo-body-xxsmall text-danger">{error}</p> : null}
      <Button color="orange" size="s" status={canSubmit ? 'default' : 'disabled'} disabled={!canSubmit} className="mt-[14px] h-[35px] rounded-[4px]" onClick={props.onSubmit}>{submitting ? '주문 정보를 저장하는 중…' : '결제하기'}</Button>
      </div>
    </section>
  );
}
