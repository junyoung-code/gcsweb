'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/button/Button';
import Tag from '@/components/ui/common/Tag';
import QrshopOptionModal from '@/components/qrshop/v2/QrshopOptionModal';
import { createPosLine, getPosStock, posLineKey, type PosCartLine, type PosPaymentMethod, type PosReceipt, type PosService } from '@/lib/services/pos-service';
import { formatWon } from '@/lib/utils';
import type { SalesProduct } from '@/types/sales-management';
import { usePosService } from './PosProvider';
import PosHeader from './PosHeader';
import { LandingDialog } from '../VisitorQrDialog';
import styles from './pos.module.css';

const assets = '/assets/sales-management/v2/pos';
const methods = [{ id: 'card', label: '카드' }, { id: 'cash', label: '현금' }, { id: 'transfer', label: '계좌이체' }] as const;
const stockMessage = '남은 재고수 이상으로 상품을 담을 수 없습니다.';

function StepIcon({ plus = false }: { plus?: boolean }) {
  return <span className={styles.stepIcon} aria-hidden="true">
    <Image src={`${assets}/minus-line.svg`} alt="" width={7.5} height={1.5} />
    {plus && <Image src={`${assets}/plus-line.svg`} alt="" width={7.5} height={1.5} className={styles.verticalLine} />}
  </span>;
}

export default function PosPage({ service: providedService }: { service?: PosService }) {
  const service = usePosService(providedService);
  const [products, setProducts] = useState<SalesProduct[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [optionProduct, setOptionProduct] = useState<SalesProduct | null>(null);
  const [method, setMethod] = useState<PosPaymentMethod | null>(null);
  const [pending, setPending] = useState(false);
  const completing = useRef(false);
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [message, setMessage] = useState('');
  const total = cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  useEffect(() => {
    let active = true;
    service.getCatalog().then(data => { if (active) setProducts(data); })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [service]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  function updateCart(next: PosCartLine[]) {
    if (completing.current) return false;
    // Removing/decreasing stale lines must remain possible after a catalog refresh.
    const onlyDecreasing = next.every(line => line.quantity <= (cart.find(item => posLineKey(item) === posLineKey(line))?.quantity ?? 0));
    if (onlyDecreasing) { setCart(next); setMessage(''); return true; }
    for (const line of next) {
      const product = products?.find(item => item.id === line.productId);
      const productQuantity = next.filter(item => item.productId === line.productId).reduce((sum, item) => sum + item.quantity, 0);
      if (!product || line.quantity > getPosStock(product, line.optionId) || productQuantity > product.stock) {
        setMessage(stockMessage);
        return false;
      }
    }
    setCart(next);
    setMessage('');
    return true;
  }

  function addLines(lines: PosCartLine[]) {
    const next = cart.map(line => ({ ...line }));
    for (const line of lines) {
      const existing = next.find(item => posLineKey(item) === posLineKey(line));
      if (existing) existing.quantity += 1;
      else next.push(line);
    }
    return updateCart(next);
  }

  function changeQuantity(line: PosCartLine, delta: number) {
    updateCart(cart.map(item => posLineKey(item) === posLineKey(line) ? { ...item, quantity: item.quantity + delta } : item)
      .filter(item => item.quantity > 0));
  }

  async function completeSale() {
    if (!method || !cart.length || completing.current) return;
    completing.current = true;
    setPending(true);
    setMessage('');
    try {
      const result = await service.completeSale(cart, method);
      setReceipt(result);
      setCart([]);
      setMethod(null);
      // The receipt is already committed even if refreshing the catalog fails.
      try { setProducts(await service.getCatalog()); }
      catch { setProducts(null); setLoadError(true); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '결제완료 처리에 실패했어요. 다시 시도해주세요.');
      try { setProducts(await service.getCatalog()); } catch { /* Keep the cart available for retry. */ }
    } finally {
      completing.current = false;
      setPending(false);
    }
  }

  const categories = [...new Set(products?.map(product => product.category).filter(Boolean))];

  return <div className={styles.page}>
    <PosHeader pending={pending} />

    <main className={styles.body}>
      <section className={styles.products} aria-label="POS 상품">
        <div className={styles.categoryRow}>
          <div className={styles.categories} role="group" aria-label="상품 카테고리">
            <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>전체</button>
            {categories.map(name => <button key={name} type="button" aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}
          </div>
          <Link href="/sales-management/v2/pos/edit" className={styles.edit}>편집</Link>
        </div>

        {loadError ? <div role="alert" className={styles.empty}>
          <p>상품 정보를 불러오지 못했어요.</p>
          <Button type="button" color="white" size="s" onClick={async () => {
            setLoadError(false);
            try { setProducts(await service.getCatalog()); } catch { setLoadError(true); }
          }}>다시 불러오기</Button>
        </div> : !products ? <p role="status" className={styles.empty}>상품을 불러오는 중입니다.</p>
          : !products.length ? <div className={styles.empty}><p>노출 중인 상품이 없습니다.</p><Link href="/sales-management/v2/products">상품 관리로 이동</Link></div>
            : <ul className={styles.grid} aria-label="POS 상품 목록">
              {products.filter(product => category === null || product.category === category).map(product => {
                const soldOut = product.stock <= 0 || (product.options.length > 0 && product.options.every(option => getPosStock(product, option.id) <= 0));
                const count = cart.filter(line => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0);
                return <li key={product.id}>
                  <button type="button" className={styles.productCard} disabled={soldOut || pending} data-sold-out={soldOut}
                    aria-label={`${product.name}, 재고 ${product.stock}개${soldOut ? ', 품절' : ''}`} onClick={() => {
                      if (product.options.length) setOptionProduct(product);
                      else addLines([createPosLine(product)]);
                    }}>
                    <span className={styles.cardTags}>
                      {product.category && <Tag contents={product.category} className={styles.tag} />}
                      {soldOut && <span className={styles.soldOutBadge}>품절</span>}
                    </span>
                    <span className={styles.productName} title={product.name}>{product.name}</span>
                    <span className={styles.stockRow}><span>재고 {product.stock.toLocaleString('ko-KR')}개</span>{count > 0 && <span className={styles.count} aria-label={`선택 ${count}개`}>{count}</span>}</span>
                  </button>
                </li>;
              })}
            </ul>}
        <p className={styles.mockNote}>Mock 모드 · 실제 결제 및 QR샵에는 반영되지 않습니다.</p>
      </section>

      <aside className={styles.cart} aria-label="POS 장바구니" aria-busy={pending}>
        {cart.length ? <ul className={styles.cartList} aria-label="선택 상품">
          {cart.map(line => <li key={posLineKey(line)}>
            <div className={styles.lineName}><h2>{line.productName}</h2>
              <button type="button" aria-label={`${line.productName} ${line.option ?? ''} 제거`} disabled={pending} onClick={() => updateCart(cart.filter(item => posLineKey(item) !== posLineKey(line)))}>
                <Image src={`${assets}/remove.svg`} alt="" width={20} height={20} />
              </button>
            </div>
            {line.option && <p className={styles.option}>{line.option}</p>}
            <div className={styles.linePrice}>
              <p>{formatWon(line.unitPrice * line.quantity)}</p>
              <div className={styles.stepper} role="group" aria-label={`${line.productName} ${line.option ?? ''} 수량`}>
                <button type="button" aria-label="수량 줄이기" disabled={pending} onClick={() => changeQuantity(line, -1)}><StepIcon /></button>
                <span aria-label="수량">{line.quantity}</span>
                <button type="button" aria-label="수량 늘리기" disabled={pending} onClick={() => changeQuantity(line, 1)}><StepIcon plus /></button>
              </div>
            </div>
          </li>)}
        </ul> : <p className={styles.cartEmpty}>상품을 선택해주세요</p>}
        <div className={styles.payment}>
          <div className={styles.amount}><h2>결제 금액</h2><p data-empty={!cart.length} aria-label="결제 금액">{formatWon(total)}</p></div>
          <div className={styles.methods} role="group" aria-label="결제수단">
            {methods.map(item => <Button type="button" key={item.id} size="s" color="white" disabled={pending}
              aria-pressed={method === item.id} onClick={() => setMethod(item.id)}>{item.label}</Button>)}
          </div>
          <Button type="button" color="orange" status={!cart.length || !method || pending || loadError ? 'disabled' : 'default'}
            className={styles.complete} onClick={completeSale}>{pending ? '처리 중' : '결제완료'}</Button>
        </div>
      </aside>
    </main>
    {message && <div role="status" className={styles.toast}>{message}</div>}
    {optionProduct && <QrshopOptionModal selectedIds={[]} products={optionProduct.options.map(option => ({
      id: option.id, name: optionProduct.name, option: option.name,
      categoryId: optionProduct.category, categoryName: optionProduct.category,
      price: optionProduct.price + option.price,
      soldOut: getPosStock(optionProduct, option.id) <= cart.filter(line => line.productId === optionProduct.id && line.optionId === option.id).reduce((sum, line) => sum + line.quantity, 0),
    }))} onClose={() => setOptionProduct(null)} onConfirm={ids => {
      if (addLines(ids.map(id => createPosLine(optionProduct, id)))) setOptionProduct(null);
    }} />}
    {receipt && <LandingDialog label="Mock 결제완료" onDismiss={() => { if (!pending) setReceipt(null); }} className={styles.receipt}>
      <h2>결제가 완료되었습니다</h2><p>주문번호 {receipt.orderCode}</p>
      <p>{methods.find(item => item.id === receipt.paymentMethod)?.label} · {formatWon(receipt.totalAmount)}</p>
      <ul>{receipt.lines.map(line => <li key={posLineKey(line)}>{line.productName}{line.option ? ` (${line.option})` : ''} / {line.quantity}개</li>)}</ul>
      <p className={styles.receiptNote}>Mock 처리이며 실제 결제·주문 및 재고에는 반영되지 않습니다.</p>
      <Button type="button" color="orange" disabled={pending} onClick={() => setReceipt(null)}>확인</Button>
    </LandingDialog>}
  </div>;
}
