'use client';

import { useRef, useState } from 'react';
import Button from '@/components/ui/button/Button';
import { LandingDialog } from '../VisitorQrDialog';
import styles from './orders.module.css';

export default function RefundDialog({ orderNo, onRefund, onDismiss }: {
  orderNo: string; onRefund: (restoreStock: boolean) => Promise<void>; onDismiss: () => void;
}) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function confirm(restoreStock: boolean) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(false);
    try { await onRefund(restoreStock); onDismiss(); }
    catch { setError(true); }
    finally { busy.current = false; setPending(false); }
  }

  return <LandingDialog label="환불 신청 확인" className={styles.refundDialog}
    onDismiss={() => { if (!busy.current) onDismiss(); }}>
    <div className={styles.refundModal} aria-busy={pending}>
      <div className={styles.refundText}>
        <h2>주문번호 [{orderNo}] 환불 처리합니다.<br />재고를 복원하시겠습니까?</h2>
        <p>환불 완료 후 취소는 불가능합니다.</p>
      </div>
      <div className={styles.refundActions}>
        <Button type="button" color="white" size="s" disabled={pending} onClick={onDismiss}>취소</Button>
        <Button type="button" color="beige" size="s" disabled={pending} onClick={() => confirm(false)}>재고 유지</Button>
        <Button type="button" color="beige" size="s" disabled={pending} onClick={() => confirm(true)}>재고 복원</Button>
      </div>
      {pending && <p role="status" className={styles.refundFeedback}>Mock 환불 처리 중입니다.</p>}
      {error && <p role="alert" className={styles.refundFeedback}>환불 처리하지 못했어요. 재고 유지 또는 재고 복원을 눌러 다시 시도해주세요.</p>}
    </div>
  </LandingDialog>;
}
