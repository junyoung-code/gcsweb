'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/common/Modal';
import type { SalesStore, VisitorOrderQr } from '@/types/sales-management';
import type { SalesManagementV2Service } from '@/lib/services/sales-management-service';
import { useStoreForm } from '../../useStoreForm';
import { useRequiredSalesManagementV2Service } from '../SalesManagementV2Provider';
import VisitorQrDialog, { LandingDialog } from '../VisitorQrDialog';
import styles from './store.module.css';

export default function StorePage() {
  const service = useRequiredSalesManagementV2Service();
  const [store, setStore] = useState<SalesStore | null>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    service.getStore().then(value => { if (active) setStore(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '상점 정보를 불러오지 못했어요. 다시 시도해주세요.'); });
    return () => { active = false; };
  }, [service, reload]);
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/sales-management/v2" aria-label="판매 관리 홈으로"><Image src="/assets/sales-management/v2/products/back.svg" alt="" width={28} height={28} /></Link>
      <h1>상점 등록</h1>
    </header>
    <main className={styles.main}>
      {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => { setError(''); setStore(undefined); setReload(value => value + 1); }}>다시 불러오기</button></div> : store === undefined ? <p role="status">상점 정보를 불러오는 중</p>
        : <StoreForm initialStore={store} service={service} />}
    </main>
  </div>;
}

function StoreForm({ initialStore, service }: { initialStore: SalesStore | null; service: SalesManagementV2Service }) {
  const router = useRouter();
  const [editing, setEditing] = useState(true);
  const form = useStoreForm(service, initialStore, true, () => setEditing(false));
  const store = form.registeredStore;
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [qr, setQr] = useState<VisitorOrderQr | null>(null);
  const [qrPending, setQrPending] = useState(false);
  const [qrError, setQrError] = useState('');
  const identifierError = form.identifierStatus === 'unavailable' ? '중복된 아이디입니다.' : form.errors.storeIdentifier;
  async function openQr() {
    if (qrPending) return;
    setQrPending(true); setQrError('');
    try { setQr(await service.getVisitorOrderQr()); }
    catch (cause) { setQrError(cause instanceof Error ? cause.message : 'QR을 불러오지 못했어요. 다시 시도해주세요.'); }
    finally { setQrPending(false); }
  }


  async function copyUrl() {
    if (!store) return;
    try { await navigator.clipboard.writeText(store.visitorOrderUrl); setCopied(true); setCopyError(''); }
    catch { setCopyError('URL을 복사하지 못했어요. 다시 시도해주세요.'); }
  }
  return <>
    <form noValidate onSubmit={form.submit} className={styles.panel}>
      <fieldset disabled={form.isSubmitting} className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor="store-name">상점명{editing && <span aria-hidden="true">*</span>}</label>
          <div className={styles.inputWithIcon}><input autoComplete="off" id="store-name" value={editing ? form.input.name : store?.name ?? ''} readOnly={!editing} required={editing}
            onChange={event => form.updateInput('name', event.target.value)} placeholder="상점명을 입력해주세요."
            aria-invalid={Boolean(form.errors.name)} aria-describedby={form.errors.name ? 'store-name-error' : undefined} />
            {editing && form.input.name && <button type="button" className={styles.clearName} aria-label="상점명 지우기" onClick={() => { form.updateInput('name', ''); document.getElementById('store-name')?.focus(); }}><Image src="/assets/icons/icon-clear.svg" alt="" width={20} height={20} /></button>}
          </div>
          {editing && form.errors.name && <p id="store-name-error" className={styles.error}>{form.errors.name}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor="store-identifier">상점 아이디{editing && <span aria-hidden="true">*</span>}</label>
          <div className={styles.identifier}>
            <div className={styles.inputWithIcon}><input autoComplete="off" id="store-identifier" value={editing ? form.input.storeIdentifier : store?.storeIdentifier ?? ''} readOnly={!editing}
              required={editing} maxLength={service.dataSource === 'api' ? undefined : 20} onChange={event => form.updateInput('storeIdentifier', event.target.value)}
              placeholder="상점 아이디를 입력해주세요." aria-invalid={Boolean(identifierError)} aria-describedby={editing ? 'store-identifier-help' : undefined} />
              {editing && (identifierError ? <span className={styles.statusIcon} role="img" aria-label="아이디 확인 오류"><Image src="/assets/icons/filled/Filled/Danger.svg" alt="" width={20} height={20} /></span>
                : form.identifierStatus === 'available' ? <span className={styles.statusIcon} role="img" aria-label="사용 가능한 아이디"><Image className={styles.successIcon} src="/assets/icons/icon-check-success.svg" alt="" width={20} height={20} /></span> : null)}
            </div>
            {editing && <button type="button" onClick={form.checkIdentifier} disabled={form.identifierStatus === 'checking'}>
              {form.identifierStatus === 'checking' ? '확인 중' : '중복 확인'}
            </button>}
          </div>
          {editing && <p id="store-identifier-help" className={identifierError ? styles.error : styles.help}>
            {identifierError ?? (form.identifierStatus === 'available' ? '사용 가능한 아이디입니다.' : '4자 이상 영문 소문자 / 숫자 조합')}
          </p>}
        </div>
      </fieldset>
      {form.submitError && <p role="alert" className={styles.error}>{form.submitError}</p>}
      <div className={`${styles.actions} ${editing ? styles.editActions : ''}`}>
        {editing ? <button className={styles.primary} type="submit" disabled={!form.canSubmit}>
          {form.isSubmitting ? '저장 중...' : store ? '상점 정보 수정하기' : '상점 등록하기'}
        </button> : <button className={styles.primary} type="button" onClick={event => { event.preventDefault(); setEditing(true); setCopied(false); }}>상점 정보 수정하기</button>}
        {store && !store.hasSalesHistory && <button type="button" disabled={form.isSubmitting} onClick={() => setDeleting(true)}>상점 삭제하기</button>}
      </div>
      {store && !editing && <p className={styles.notice}>상점 아이디를 수정할 경우 상점 URL과 QR코드가 새로 발급됩니다.</p>}
    </form>
    <section className={`${styles.qrPanel} ${!store ? styles.emptyQrPanel : ''}`} aria-label="QR샵 URL">
      {store ? <>
        <h2>QR샵 URL</h2>
        <div className={styles.qrRow}>
          <button type="button" className={styles.qrPreview} aria-label="방문객 주문 QR 열기" disabled={qrPending} onClick={openQr}><span>QR 보기</span></button>
          <div className={styles.qrInfo}>
            <label htmlFor="visitor-url">방문객 주문 URL</label>
            <div className={styles.urlRow}>
              <input id="visitor-url" readOnly value={store.visitorOrderUrl} />
              <button type="button" onClick={copyUrl}>{copied ? '복사됨' : '복사하기'}</button>
            </div>
            <p className={styles.help}>해당 QR코드와 URL을 사용해 방문객들이 상점 사이트로 바로 진입할 수 있습니다.</p>
            {copyError && <p role="alert" className={styles.error}>{copyError}</p>}
          </div>
        </div>
      </> : <p className={styles.emptyQr}>상점 등록 시 방문객들이 사용할 상점 바로가기 URL과 QR코드가 발급됩니다</p>}
    </section>
    {qrError && <p role="alert" className={styles.error}>{qrError}</p>}
    {qr && <VisitorQrDialog qr={qr} onDismiss={() => setQr(null)} />}
    {deleting && <StoreDeleteDialog onDismiss={() => setDeleting(false)} onConfirm={async () => {
      await service.deleteStore();
      router.push('/sales-management/v2');
    }} />}
  </>;
}

function StoreDeleteDialog({ onConfirm, onDismiss }: { onConfirm: () => Promise<void>; onDismiss: () => void }) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const dismiss = () => { if (!busy.current) onDismiss(); };
  async function confirm() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    try { await onConfirm(); onDismiss(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '상점을 삭제하지 못했어요. 다시 시도해주세요.'); }
    finally { busy.current = false; setPending(false); }
  }
  return <LandingDialog label="상점 삭제 확인" className={styles.dialog} onDismiss={dismiss}>
    <Modal variant="Large" title="상점을 삭제하시겠습니까?" description="삭제된 상점은 다시 복구할 수 없습니다."
      className={styles.modal} titleClassName={styles.modalTitle} disabled={pending} onCancel={dismiss} onConfirm={confirm} />
    {error && <p role="alert" className={styles.dialogError}>{error}</p>}
  </LandingDialog>;
}
