'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Button from '@/components/ui/button/Button';
import type { VisitorOrderQr } from '@/types/sales-management';
import styles from './landing.module.css';

export function LandingDialog({ children, label, onDismiss, className = '' }: {
  children: ReactNode; label: string; onDismiss: () => void; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const dialog = ref.current;
    dialog?.showModal();
    // Focus the dialog itself so opening it does not draw an action-button ring.
    dialog?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else (document.getElementById('landing-title') ?? document.getElementById('products-title'))?.focus();
    };
  }, []);

  return createPortal(
    <dialog ref={ref} tabIndex={-1} aria-label={label} className={`${styles.dialog} ${className}`}
      onCancel={event => { event.preventDefault(); onDismiss(); }}>
      {children}
    </dialog>, document.body,
  );
}

export default function VisitorQrDialog({ qr, onDismiss }: { qr: VisitorOrderQr; onDismiss: () => void }) {
  const [message, setMessage] = useState('');
  const [imageReady, setImageReady] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(qr.visitorOrderUrl);
      setMessage('방문객 주문 URL을 복사했어요.');
    } catch {
      setMessage('복사하지 못했어요. URL을 직접 선택해 복사해주세요.');
    }
  }

  return (
    <LandingDialog label="방문객 주문 QR" onDismiss={onDismiss} className={styles.qrDialog}>
      <div className={styles.qrHeader}>
        <h2>방문객 주문 QR</h2>
        <button type="button" aria-label="QR 모달 닫기" onClick={onDismiss}>
          <Image src="/assets/sales-management/v2/close.svg" alt="" width={29} height={29} />
        </button>
      </div>
      <div className={styles.qrImage}>
        <Image src={qr.imageUrl} alt="방문객 주문 QR 코드" width={307} height={307} unoptimized
          onLoad={() => setImageReady(true)}
          onError={() => { setImageReady(false); setMessage('QR 이미지를 불러오지 못했어요. 다시 열어주세요.'); }} />
      </div>
      <div className={styles.qrDetails}>
        <label htmlFor="visitor-order-url">방문객 주문 URL</label>
        <div className={styles.qrUrl}>
          <input id="visitor-order-url" value={qr.visitorOrderUrl} readOnly onFocus={event => event.currentTarget.select()} />
          <button type="button" aria-label="방문객 주문 URL 복사" onClick={copyUrl}>
            <span className={styles.copyIcon} aria-hidden="true" />
          </button>
        </div>
        <p className={styles.qrHelp}>{qr.isMock ? 'Mock 예시 QR입니다. 표시된 상점 URL의 실제 QR이 아니며 운영에 사용할 수 없습니다.' : '해당 QR코드와 URL을 사용해 방문객들이 상점 사이트로 바로 진입할 수 있습니다.'}</p>
        <div className={styles.qrActions}>
          {imageReady && !qr.isMock ? <a href={qr.imageUrl} download={qr.imageUrl.startsWith('data:image/svg+xml') ? '방문객-주문-QR.svg' : '방문객-주문-QR.png'}>이미지 저장</a>
            : <Button color="white" disabled>이미지 저장</Button>}
          <Button color="beige" disabled={!imageReady || qr.isMock} onClick={() => window.print()}>인쇄</Button>
        </div>
        {message && <p role="status" className={styles.qrMessage}>{message}</p>}
      </div>
    </LandingDialog>
  );
}
