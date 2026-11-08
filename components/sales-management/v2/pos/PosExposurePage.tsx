'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/button/Button';
import { copyPosExposure, reconcilePosExposure, type PosExposure, type PosProduct } from '@/lib/services/pos-service';
import { formatWon } from '@/lib/utils';
import PosHeader from './PosHeader';
import { usePosSession } from './PosProvider';
import pageStyles from './pos.module.css';
import styles from './exposure.module.css';

const root = '/sales-management/v2/pos';
const assets = '/assets/sales-management/v2/pos/exposure';
const categoryName = (name: string) => name || '미분류';
const registeredDate = (product: PosProduct) => product.createdAt && /^\d{4}-\d{2}-\d{2}/.test(product.createdAt) ? product.createdAt.slice(0, 10) : null;

function moved<T,>(items: T[], index: number, delta: number): T[] {
  const next = [...items];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}

export default function PosExposurePage({ mode }: { mode: 'edit' | 'add' }) {
  const session = usePosSession();
  if (!session) throw new Error('POS Provider가 필요합니다.');
  const { service, draft, setDraft } = session;
  const router = useRouter();
  const [products, setProducts] = useState<PosProduct[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [year, setYear] = useState('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [ascending, setAscending] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const selectAll = useRef<HTMLInputElement>(null);
  const dragged = useRef<{ category: string; id?: string } | null>(null);
  // Draft belongs to the POS layout so edit -> add -> edit keeps unsaved changes.
  const initialDraft = useRef(draft);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    Promise.all([service.getExposureProducts(), service.getExposure()]).then(([items, saved]) => {
      if (!active) return;
      setProducts(items);
      setDraft(reconcilePosExposure(initialDraft.current ?? saved, items, saved.map(group => group.category)));
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [service, setDraft, attempt]);

  const groups = draft ?? [];
  const assigned = new Set(groups.flatMap(group => group.productIds));
  const available = products?.filter(product => !assigned.has(product.id)) ?? [];
  const years = [...new Set(available.map(product => registeredDate(product)?.slice(0, 4)).filter((value): value is string => Boolean(value)))].sort().reverse();
  const filtered = available.filter(product => (year === 'all' || registeredDate(product)?.startsWith(year)) &&
    (category === 'all' || product.category === category) && product.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => (registeredDate(a) ?? '').localeCompare(registeredDate(b) ?? '') * (ascending ? 1 : -1));
  const allSelected = filtered.length > 0 && filtered.every(product => selected.includes(product.id));
  const selectedCount = available.filter(product => selected.includes(product.id)).length;
  const visibleCount = groups.filter(group => !group.hidden).reduce((sum, group) => sum + group.productIds.length, 0);

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = !allSelected && filtered.some(product => selected.includes(product.id));
  }, [allSelected, filtered, selected]);

  function update(next: PosExposure) { if (!saving.current) setDraft(next); }
  function moveCategory(index: number, delta: number) {
    update(moved(groups, index, delta));
  }
  function moveProduct(groupIndex: number, index: number, delta: number) {
    update(groups.map((group, i) => i === groupIndex ? { ...group, productIds: moved(group.productIds, index, delta) } : group));
  }
  function dropCategory(target: string) {
    const item = dragged.current;
    dragged.current = null;
    if (!item || item.id || !target || item.category === target) return;
    const next = copyPosExposure(groups);
    const from = next.findIndex(group => group.category === item.category);
    const to = next.findIndex(group => group.category === target);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    update(next);
  }
  function dropProduct(category: string, target: string) {
    const item = dragged.current;
    dragged.current = null;
    if (!item?.id || item.category !== category || item.id === target) return;
    update(groups.map(group => {
      if (group.category !== category) return group;
      const ids = [...group.productIds];
      ids.splice(ids.indexOf(target), 0, ids.splice(ids.indexOf(item.id!), 1)[0]);
      return { ...group, productIds: ids };
    }));
  }
  async function save() {
    if (!draft || saving.current) return;
    saving.current = true;
    setPending(true); setError('');
    try {
      await service.saveExposure(draft);
      setDraft(null);
      router.push(root);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '저장하지 못했어요. 다시 시도해주세요.');
    } finally { saving.current = false; setPending(false); }
  }
  function addSelected() {
    if (!draft || !selectedCount) return;
    update(groups.map(group => ({ ...group, productIds: [...group.productIds,
      ...available.filter(product => product.category === group.category && selected.includes(product.id)).map(product => product.id)] })));
    router.push(`${root}/edit`);
  }

  return <div className={pageStyles.page}>
    <PosHeader pending={pending} initialHelp={false} />
    <main className={styles.body}>
      <div className={styles.heading}>
        <div><h1>{mode === 'edit' ? '포스 노출 상품' : '노출 상품 선택'}</h1>
          <span>{mode === 'edit' ? `노출 상품 ${visibleCount}개` : `미노출 상품 ${available.length}개`}</span></div>
        <Link className={styles.actionLink} href={`${root}/${mode === 'edit' ? 'add' : 'edit'}`}>
          {mode === 'edit' ? '노출 상품 추가하기' : '포스 노출 상품 목록 보기'}
        </Link>
      </div>
      {loadError ? <div className={styles.empty} role="alert"><p>상품 정보를 불러오지 못했어요.</p>
        <Button type="button" color="white" size="s" onClick={() => setAttempt(attempt + 1)}>다시 불러오기</Button></div>
        : !products || !draft ? <p role="status" className={styles.empty}>상품을 불러오는 중입니다.</p>
          : mode === 'edit' ? <>
            <div className={styles.categoryTable} role="table" aria-label="노출 상품 구성">
              <div className={styles.tableHeading} role="row"><div role="columnheader">카테고리</div><div role="columnheader">상품 <span>왼쪽 → 오른쪽 순서대로 포스에 노출</span></div></div>
              {groups.map((group, groupIndex) => <div key={group.category} role="row" className={styles.categoryRow} data-hidden={group.hidden}>
                <div role="cell" className={styles.categoryCell} onDragOver={event => event.preventDefault()} onDrop={() => dropCategory(group.category)}>
                  <div className={styles.categoryTitle}>
                    {group.category && <span draggable onDragStart={() => { dragged.current = { category: group.category }; }} onDragEnd={() => { dragged.current = null; }} className={styles.dragHandle} title="카테고리 순서 변경">
                      <Image src={`${assets}/burger.svg`} alt="" width={17.5} height={13.5} /></span>}
                    <h2>{categoryName(group.category)}</h2>
                    {group.category && <button type="button" className={styles.visibility} aria-label={`${group.category} ${group.hidden ? '보이기' : '숨기기'}`} aria-pressed={!group.hidden}
                      onClick={() => update(groups.map((item, i) => i === groupIndex ? { ...item, hidden: !item.hidden } : item))}>
                      <Image src={`${assets}/eye.svg`} alt="" width={19.5} height={13.5} />{group.hidden && <span className={styles.hiddenSlash} />}
                    </button>}
                  </div>
                  {group.category && <div className={styles.categoryMove}>
                    <button type="button" aria-label={`${group.category} 위로`} disabled={groupIndex === 0 || pending} onClick={() => moveCategory(groupIndex, -1)}>↑</button>
                    <button type="button" aria-label={`${group.category} 아래로`} disabled={groupIndex >= groups.length - 2 || pending} onClick={() => moveCategory(groupIndex, 1)}>↓</button>
                    {group.hidden && <span>숨김</span>}
                  </div>}
                </div>
                <div role="cell" className={styles.productCell}>
                  {group.productIds.length ? group.productIds.map((id, index) => {
                    const product = products.find(item => item.id === id);
                    return product && <div key={id} className={styles.productChip} draggable={!pending}
                      onDragStart={() => { dragged.current = { category: group.category, id }; }} onDragEnd={() => { dragged.current = null; }}
                      onDragOver={event => event.preventDefault()} onDrop={event => { event.stopPropagation(); dropProduct(group.category, id); }}>
                      <span title={product.name}>{product.name}</span>
                      <button type="button" className={styles.remove} aria-label={`${product.name} 노출 제거`} disabled={pending}
                        onClick={() => update(groups.map(item => ({ ...item, productIds: item.productIds.filter(productId => productId !== id) })))}>−</button>
                      <div className={styles.productMove}>
                        <button type="button" aria-label={`${product.name} 앞으로`} disabled={index === 0 || pending} onClick={() => moveProduct(groupIndex, index, -1)}>←</button>
                        <button type="button" aria-label={`${product.name} 뒤로`} disabled={index === group.productIds.length - 1 || pending} onClick={() => moveProduct(groupIndex, index, 1)}>→</button>
                      </div>
                    </div>;
                  }) : <p className={styles.emptyGroup}>노출 중인 상품이 없습니다 · 노출 상품 추가하기에서 상품을 올려주세요</p>}
                </div>
              </div>)}
            </div>
            <footer className={styles.footer}>
              <p><span className={styles.infoIcon}><Image src={`${assets}/info-mark.svg`} alt="" width={3.5} height={11.5} /></span>카테고리 순서와 상품 순서가 POS에 반영됩니다.</p>
              <div><Button type="button" size="m" color="white" disabled={pending} onClick={() => { setDraft(null); router.push(root); }}>취소</Button>
                <Button type="button" size="m" color="orange" disabled={pending} onClick={save}>{pending ? '저장 중' : '저장'}</Button></div>
            </footer>
          </> : <>
            <div className={styles.filters}>
              <div className={pageStyles.categories} role="group" aria-label="등록 연도">
                <button type="button" aria-pressed={year === 'all'} onClick={() => setYear('all')}>전체 {available.length}</button>
                {years.map(value => <button key={value} type="button" aria-pressed={year === value} onClick={() => setYear(value)}>{value} {available.filter(product => registeredDate(product)?.startsWith(value)).length}</button>)}
              </div>
              <div className={styles.searchGroup}>
                <label className={styles.categoryFilter}><span className="sr-only">상품 카테고리</span>
                  <select value={category} onChange={event => setCategory(event.target.value)}><option value="all">상품 카테고리</option>
                    {[...new Set(available.map(product => product.category))].map(value => <option key={value} value={value}>{categoryName(value)}</option>)}</select>
                  <Image src={`${assets}/filter-down.svg`} alt="" width={20} height={20} />
                </label>
                <label className={styles.search}><span className="sr-only">상품 검색</span><input type="search" placeholder="상품 검색" value={query} onChange={event => setQuery(event.target.value)} />
                  <Image src={`${assets}/search.svg`} alt="" width={20} height={20.458} /></label>
              </div>
            </div>
            <div className={styles.productTable}>
              <table aria-label="미노출 상품 목록">
                <thead><tr><th className={styles.checkboxCell}><input ref={selectAll} type="checkbox" aria-label="현재 목록 전체 선택" checked={allSelected} disabled={!filtered.length} onChange={() => {
                  const ids = filtered.map(product => product.id);
                  setSelected(allSelected ? selected.filter(id => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
                }} /></th><th>상품명</th><th>카테고리</th><th><button type="button" onClick={() => setAscending(!ascending)} aria-label={`등록일 ${ascending ? '내림차순' : '오름차순'} 정렬`}>
                  등록일 <Image src={`${assets}/sort.svg`} alt="" width={16} height={16} className={ascending ? styles.sortAsc : undefined} /></button></th><th>재고</th><th>가격</th></tr></thead>
                <tbody>{filtered.map(product => <tr key={product.id}>
                  <td className={styles.checkboxCell}><input type="checkbox" aria-label={`${product.name} 선택`} checked={selected.includes(product.id)} onChange={() => setSelected(selected.includes(product.id) ? selected.filter(id => id !== product.id) : [...selected, product.id])} /></td>
                  <td className={styles.name}>{product.name}</td><td>{categoryName(product.category)}</td><td>{registeredDate(product)?.replaceAll('-', '.') ?? '—'}</td>
                  <td className={product.stock <= 0 ? styles.soldOut : undefined}>{product.stock <= 0 ? '품절' : `${product.stock.toLocaleString('ko-KR')}개`}</td><td>{formatWon(product.price)}</td>
                </tr>)}</tbody>
              </table>
              {!filtered.length && <p className={styles.empty}>{available.length ? '검색 결과가 없습니다.' : '추가할 미노출 상품이 없습니다.'}</p>}
            </div>
            <div className={styles.selectionBar}><p aria-live="polite">{selectedCount ? `${selectedCount}개 선택` : '노출할 상품을 선택하세요'}</p>
              <div><button type="button" disabled={!selectedCount} onClick={() => setSelected([])}>선택 해제</button>
                <Button type="button" size="m" color="orange" status={selectedCount ? 'default' : 'disabled'} onClick={addSelected}>노출 상품으로 이동</Button></div>
            </div>
          </>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </main>
  </div>;
}
