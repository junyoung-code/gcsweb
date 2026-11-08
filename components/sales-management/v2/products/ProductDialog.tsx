'use client';

import { useRef, useState } from 'react';
import { salesApiErrorMessage } from '@/lib/services/sales-management-store-api-service';
import Modal from '@/components/ui/common/Modal';
import { LandingDialog } from '../VisitorQrDialog';
import styles from './products.module.css';

export default function ProductDialog({ kind, onConfirm, onDismiss }: {
  kind: 'create' | 'delete' | 'updated'; onConfirm?: () => Promise<void>; onDismiss: () => void;
}) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    try { await onConfirm?.(); onDismiss(); }
    catch (error) { setError(salesApiErrorMessage(error, '처리하지 못했어요. 다시 시도해주세요.')); }
    finally { busy.current = false; setPending(false); }
  }
  if (kind === 'updated') return <LandingDialog label="상품 수정 완료" className={styles.dialog} onDismiss={onDismiss}>
    <Modal variant="one button" className={`${styles.modal} ${styles.completedModal}`} titleClassName={styles.modalTitle}
      title="상품 수정이 완료되었습니다." onConfirm={onDismiss} />
  </LandingDialog>;
  return <LandingDialog label={kind === 'create' ? '상품 등록 확인' : '상품 삭제 확인'}
    className={styles.dialog} onDismiss={() => { if (!busy.current) onDismiss(); }}>
    <Modal variant="Large" className={styles.modal} titleClassName={styles.modalTitle} disabled={pending}
      title={kind === 'create' ? '상품 등록을 완료하시겠습니까?' : '상품을 삭제하시겠습니까?'}
      description={kind === 'create' ? '상품 정보는 언제든지 수정가능합니다.' : '삭제된 상품은 다시 복구할 수 없습니다.'}
      onConfirm={confirm} onCancel={onDismiss} />
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </LandingDialog>;
}
