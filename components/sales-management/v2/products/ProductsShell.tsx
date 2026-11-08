import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './products.module.css';

export const productsPath = '/sales-management/v2/products';
export const productAssets = '/assets/sales-management/v2/products';

export default function ProductsShell({ children, form = false }: { children: ReactNode; form?: boolean }) {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/sales-management/v2" aria-label="판매 관리 홈으로"><Image src={`${productAssets}/back.svg`} alt="" width={28} height={28} /></Link>
      <h1 id="products-title" tabIndex={-1}>상품 관리</h1>
    </header>
    <main className={styles.main}>
      <nav aria-label="상품 관리 메뉴" className={`${styles.tabs} ${form ? styles.formTabs : ''}`}>
        <Link href={productsPath} aria-current={!form ? 'page' : undefined}>전체 상품</Link>
        <Link href={`${productsPath}/new`} aria-current={form ? 'page' : undefined}>상품 등록하기</Link>
      </nav>
      {children}
    </main>
  </div>;
}
