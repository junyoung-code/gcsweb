'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/button/Button';
import { createMockPosStaffService } from '@/lib/mocks/pos-staff-service';
import type { PosStaffMember, PosStaffService, PosStaffSnapshot } from '@/lib/services/pos-staff-service';
import { LandingDialog } from '../VisitorQrDialog';
import { usePosSession } from './PosProvider';
import styles from './staff.module.css';

const assets = '/assets/sales-management/v2/pos/staff';
type Action = 'approve' | 'reject' | 'remove';

const date = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export function staffDate(member: PosStaffMember, registered: boolean, now = new Date()) {
  const value = registered ? member.registeredAt : member.requestedAt;
  if (!value || Number.isNaN(Date.parse(value))) return registered ? '등록일 정보 없음' : '요청일 정보 없음';
  if (registered) return `등록일 ${date(value).replaceAll('-', '.')}`;
  const requested = date(value) === date(now.toISOString())
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
    : date(value).replaceAll('-', '.');
  return `${requested} 등록 요청`;
}

export default function PosStaffPanel({ disabled = false, onOpen, service: providedService }: { disabled?: boolean; onOpen?: () => void; service?: PosStaffService }) {
  const session = usePosSession();
  const [fallback] = useState(() => createMockPosStaffService());
  const service = providedService ?? session?.staffService ?? fallback;
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PosStaffSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<{ action: Action; id: string } | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [copying, setCopying] = useState(false);
  const locked = useRef(false);
  const copyLocked = useRef(false);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    setLoading(true); setLoadError(false);
    try { const result = await service.getStaff(); if (mounted.current) setData(result); }
    catch { if (mounted.current) setLoadError(true); }
    finally { locked.current = false; if (mounted.current) setLoading(false); }
  }, [service]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  async function act(action: Action, id: string) {
    if (locked.current) return;
    locked.current = true; setWorking(true); setFailure(null);
    try { const result = await service[action](id); if (mounted.current) setData(result); }
    catch { if (mounted.current) setFailure({ action, id }); }
    finally { locked.current = false; if (mounted.current) setWorking(false); }
  }

  async function copyInvite() {
    if (!data || copyLocked.current) return;
    copyLocked.current = true; setCopying(true); setCopyMessage('');
    try {
      await navigator.clipboard.writeText(data.inviteUrl);
      if (mounted.current) setCopyMessage('Mock 초대 링크를 복사했어요. 실제 직원 초대에는 사용할 수 없습니다.');
    } catch {
      if (mounted.current) setCopyMessage('복사하지 못했어요. 링크를 직접 선택해 복사해주세요.');
    } finally { copyLocked.current = false; if (mounted.current) setCopying(false); }
  }

  const busy = loading || working;
  function rows(members: PosStaffMember[], registered: boolean) {
    return <ul className={registered ? styles.registered : styles.pending} aria-label={registered ? '등록된 직원 목록' : '승인 대기 목록'}>
      {members.map(member => <li key={member.id} className={styles.row}>
        <span className={styles.avatar} aria-hidden="true">{Array.from(member.name)[0]}</span>
        <div className={styles.info}><strong>{member.name}</strong><span>{staffDate(member, registered)}</span></div>
        <div className={styles.actions}>
          {registered ? <Button type="button" color="white" size="s" className={styles.remove} disabled={busy} aria-label={`${member.name} 삭제`} onClick={() => void act('remove', member.id)}>삭제</Button>
            : <><Button type="button" color="white" size="s" disabled={busy} aria-label={`${member.name} 거절`} onClick={() => void act('reject', member.id)}>거절</Button>
              <Button type="button" color="orange" size="s" disabled={busy} aria-label={`${member.name} 승인`} onClick={() => void act('approve', member.id)}>승인</Button></>}
        </div>
      </li>)}
    </ul>;
  }

  return <>
    <Button type="button" size="s" color="white" className={styles.trigger} disabled={disabled} aria-label="직원 관리" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setOpen(true); setCopyMessage(''); onOpen?.(); }}>
      직원 관리{data && data.pending.length > 0 && <span className={styles.badge} aria-label={`승인 대기 ${data.pending.length}명`}>{data.pending.length}</span>}
    </Button>
    {open && <LandingDialog label="직원 관리" onDismiss={() => setOpen(false)} className={styles.drawer}>
      <div className={styles.header}><h2>직원 관리</h2><button type="button" aria-label="직원 관리 닫기" onClick={() => setOpen(false)}><Image src={`${assets}/close.svg`} alt="" width={20} height={20} /></button></div>
      <div className={styles.content} aria-busy={busy}>
        <section className={styles.invite}>
          <label htmlFor="staff-invite">직원 초대 링크</label>
          <div className={styles.link}><input id="staff-invite" aria-describedby="staff-mock-note" readOnly value={data?.inviteUrl ?? ''} placeholder="링크를 불러오는 중입니다." onFocus={event => event.currentTarget.select()} />
            <button type="button" aria-label="Mock 직원 초대 링크 복사" disabled={!data || copying} onClick={() => void copyInvite()}><span className={styles.copyIcon} aria-hidden="true"><Image src={`${assets}/copy-back.svg`} alt="" width={11.0988} height={15.0988} /></span></button>
          </div>
          <p id="staff-mock-note" className={styles.note}>Mock 예시 · 실제 초대와 직원 권한에는 반영되지 않으며, 새로고침 시 초기화됩니다.</p>
          {copyMessage && <p role="status" className={styles.note}>{copyMessage}</p>}
        </section>
        {loading && <p role="status">직원 정보를 불러오는 중입니다.</p>}
        {loadError && <div role="alert"><p>직원 정보를 불러오지 못했어요.</p><Button type="button" color="white" size="s" disabled={busy} onClick={() => void load()}>다시 불러오기</Button></div>}
        {failure && <div role="alert"><p>직원 변경에 실패했어요. 기존 목록을 유지했습니다.</p><Button type="button" color="white" size="s" disabled={busy} onClick={() => void act(failure.action, failure.id)}>다시 시도</Button></div>}
        {working && <p role="status">직원 변경을 처리하는 중입니다.</p>}
        {data && <>
          <section className={styles.section}><h3>승인 대기 ({data.pending.length})</h3>{data.pending.length ? rows(data.pending, false) : <p className={styles.empty}>승인 대기 중인 직원이 없습니다.</p>}</section>
          <section className={styles.section}><h3>등록된 직원 ({data.registered.length})</h3>{data.registered.length ? rows(data.registered, true) : <p className={styles.empty}>등록된 직원이 없습니다.</p>}</section>
        </>}
      </div>
    </LandingDialog>}
  </>;
}
