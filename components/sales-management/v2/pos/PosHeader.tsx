'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import ToggleSwitch from '@/components/ui/button/ToggleSwitch';
import PosStaffPanel from './PosStaffPanel';
import styles from './pos.module.css';

const assets = '/assets/sales-management/v2/pos';

export default function PosHeader({ pending = false, initialHelp = true, page = 'pos' }: { pending?: boolean; initialHelp?: boolean; page?: 'pos' | 'orders' }) {
  const [qrOpen, setQrOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(initialHelp);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className={styles.header}>
      <div className={styles.navigation}>
        <h1><button type="button" className={styles.title} data-page={page} aria-expanded={menuOpen} aria-controls="pos-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          <span>{page === 'orders' ? '전체 주문 조회' : '현장 포스'}</span><Image src={`${assets}/down.svg`} alt="" width={24} height={24} />
        </button></h1>
        {menuOpen && <nav id="pos-navigation" aria-label="판매 관리 화면" className={styles.menu}>
          <Link href="/sales-management/v2">판매 관리 홈</Link>
          <Link href="/sales-management/v2/products">상품 관리</Link>
          <Link href="/sales-management/v2/pos" aria-current={page === 'pos' ? 'page' : undefined}>현장 포스</Link>
          <Link href="/sales-management/v2/orders" aria-current={page === 'orders' ? 'page' : undefined}>전체 주문 조회</Link>
        </nav>}
      </div>
      <div className={styles.headerActions}>
        <PosStaffPanel disabled={pending} onOpen={() => setShowHelp(false)} />
        <button type="button" className={styles.qrLabel} aria-label="QR shop 도움말" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}>QR shop</button>
        <label className={styles.qrControl}>
          <span className="sr-only">QR shop</span>
          <ToggleSwitch checked={qrOpen} disabled={pending} onChange={checked => { setQrOpen(checked); setShowHelp(false); }} />
        </label>
      </div>
      {showHelp && <div className={styles.help} role="note">
        <Image src={`${assets}/tooltip.svg`} alt="" width={474} height={57.9998} />
        <p>토글을 누르면 QR샵을 오픈할 수 있어요. 오픈시 고객들에게 상품이 노출돼요</p>
        <span className="sr-only">현재는 Mock 상태로 실제 QR샵에는 반영되지 않습니다.</span>
      </div>}
    </header>
  );
}
