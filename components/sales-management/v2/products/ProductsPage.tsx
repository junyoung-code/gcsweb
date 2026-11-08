'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { salesApiErrorMessage } from '@/lib/services/sales-management-store-api-service';
import type { SalesProduct, SalesStore } from '@/types/sales-management';
import { useRequiredSalesManagementV2Service } from '../SalesManagementV2Provider';
import ProductsShell, { productAssets, productsPath } from './ProductsShell';
import ProductGrid from './ProductGrid';
import ProductDialog from './ProductDialog';
import ProductForm from './ProductForm';
import styles from './products.module.css';

export default function ProductsPage({ form = false, productId }: { form?: boolean; productId?: string }) {
  const service = useRequiredSalesManagementV2Service();
  const [data, setData] = useState<{ products: SalesProduct[]; categories: string[]; store: SalesStore | null; newestProductId: string | null } | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<SalesProduct | null>(null);
  const request = useRef(0);
  const filterRef = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    const [result, categories, store] = await Promise.all([service.getProducts(), service.getCategories(), service.getStore()]);
    if (current === request.current) {
      setData({ products: result.items, categories, store, newestProductId: result.newestProductId });
      setError('');
    }
  }, [service]);
  useEffect(() => {
    void refresh().catch(error => setError(salesApiErrorMessage(error, '상품을 불러오지 못했어요. 다시 시도해주세요.')));
    const activeRequest = request;
    return () => { activeRequest.current++; };
  }, [refresh]);

  const filtered = (data?.products ?? []).filter(product => (!category || product.category === category) && product.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const editing = productId ? data?.products.find(product => product.id === productId) : undefined;
  function movePage(next: number) { setPage(next); document.getElementById('products-title')?.scrollIntoView({ block: 'start' }); }

  return <ProductsShell form={form}>
    {error ? <p role="alert" className={styles.empty}>{error} <button onClick={() => { setError(''); void refresh().catch(error => setError(salesApiErrorMessage(error, '상품을 불러오지 못했어요. 다시 시도해주세요.'))); }}>다시 불러오기</button></p>
      : !data ? <p role="status" className={styles.empty}>상품을 불러오는 중입니다.</p>
      : !data.store ? <p className={styles.empty}>상점을 먼저 등록해주세요. <Link href="/sales-management/v2?state=empty">판매 관리 홈으로</Link></p>
      : form ? <>
        {productId && !editing ? <p className={styles.empty}>상품을 찾을 수 없어요. <Link href={productsPath}>전체 상품으로</Link></p>
          : <ProductForm key={productId ?? 'new'} product={editing} storeId={data.store.id} categories={data.categories}
            service={service} onSaved={refresh} onCategoryCreated={name => setData(current => current ? { ...current, categories: [...new Set([...current.categories, name])] } : current)} />}
        {(!productId || editing) && <section className={styles.registered} aria-label="최근 등록된 상품">
          <h2>최근 등록된 상품</h2>
          {data.products.length ? <ProductGrid products={data.products.slice(0, 6)} newestProductId={data.newestProductId} onDelete={setDeleting} />
            : <p className={styles.recentEmpty}>아직 등록된 상품이 없습니다.</p>}
        </section>}
      </> : <>
        <div className={styles.filters}>
          <div ref={filterRef} className={styles.filter} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFilterOpen(false); }}
            onKeyDown={event => { if (event.key === 'Escape') { setFilterOpen(false); filterRef.current?.querySelector('button')?.focus(); } }}>
            <button type="button" aria-label="카테고리 필터" aria-expanded={filterOpen} aria-controls="product-categories"
              className={filterOpen ? styles.filterActive : ''} onClick={() => setFilterOpen(!filterOpen)}>
              {category || '전체'}<Image src={`${productAssets}/down.svg`} alt="" width={20} height={20} className={filterOpen ? styles.rotated : ''} />
            </button>
            {filterOpen && <div id="product-categories" className={styles.menu}>
              {['', ...data.categories].map(name => <button type="button" key={name} onClick={() => { setCategory(name); setPage(1); setFilterOpen(false); filterRef.current?.querySelector('button')?.focus(); }}>{name || '전체'}</button>)}
            </div>}
          </div>
          <label className={styles.search}>
            <span className="sr-only">상품 검색</span>
            <input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="상품 검색" />
            <Image src={`${productAssets}/search.svg`} alt="" width={20} height={20.458} />
          </label>
        </div>
        {filtered.length ? <ProductGrid products={filtered.slice((currentPage - 1) * 20, currentPage * 20)} onDelete={setDeleting} />
          : <p className={styles.listEmpty}>{data.products.length ? '검색 결과가 없습니다.' : '아직 등록된 상품이 없습니다.'}</p>}
        {totalPages > 1 && <nav aria-label="페이지네이션" className={styles.pagination}>
          <button disabled={currentPage === 1} aria-label="이전 페이지" onClick={() => movePage(currentPage - 1)}><Image src={`${productAssets}/page-left.svg`} alt="" width={24} height={24} /></button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => Math.min(Math.max(1, currentPage - 2), Math.max(1, totalPages - 4)) + index).map(number =>
            <button key={number} aria-current={number === currentPage ? 'page' : undefined} onClick={() => movePage(number)}>{number}</button>)}
          <button disabled={currentPage === totalPages} aria-label="다음 페이지" onClick={() => movePage(currentPage + 1)}><Image src={`${productAssets}/page-right.svg`} alt="" width={24} height={24} /></button>
        </nav>}
      </>}
    {deleting && <ProductDialog kind="delete" onDismiss={() => setDeleting(null)} onConfirm={async () => { await service.deleteProduct(deleting.id); await refresh(); }} />}
  </ProductsShell>;
}
