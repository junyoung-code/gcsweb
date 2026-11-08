'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { createMockOrdersService } from '@/lib/mocks/orders-service';
import { ORDERS_PAGE_SIZE, orderItemsText, orderPaymentLabels, seoulOrderDate, type OrderChannel, type OrdersQuery, type OrdersResult, type OrdersService, type SalesOrder } from '@/lib/services/orders-service';
import { formatWon } from '@/lib/utils';
import PosHeader from '../pos/PosHeader';
import RefundDialog from './RefundDialog';
import styles from './orders.module.css';

const assets = '/assets/sales-management/v2/orders';
const channels = [{ id: 'all', label: '전체' }, { id: 'online', label: '온라인결제' }, { id: 'onsite', label: '현장결제' }] as const;
const time = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const dateTitle = (value: string) => value.split('-').map(Number).map((value, index) => `${value}${['년', '월', '일'][index]}`).join(' ');
const manualRefundHelp = {
  card: '카드 결제는 카드 단말기에서 별도 취소해주세요.',
  cash: '현금 결제는 고객에게 현금으로 별도 환불해주세요.',
  transfer: '계좌이체 결제는 고객 계좌로 별도 송금해주세요.',
};

function CalendarIcon() {
  return <span className={styles.calendarIcon} aria-hidden="true">
    <span className={styles.calendarBox} />
    <Image className={styles.calendarLine} src={`${assets}/calendar-line.svg`} alt="" width={12} height={1.04167} />
    <Image className={styles.calendarPinLeft} src={`${assets}/calendar-pin.svg`} alt="" width={3.04167} height={1.04167} />
    <Image className={styles.calendarPinRight} src={`${assets}/calendar-pin.svg`} alt="" width={3.04167} height={1.04167} />
    <Image className={styles.calendarDots1} src={`${assets}/calendar-dots-1.svg`} alt="" width={8.375} height={1.04167} />
    <Image className={styles.calendarDots2} src={`${assets}/calendar-dots-2.svg`} alt="" width={8.375} height={1.04167} />
  </span>;
}

export default function OrdersPage({ service: providedService }: { service?: OrdersService }) {
  const [service] = useState(() => providedService ?? createMockOrdersService());
  const today = seoulOrderDate();
  const [query, setQuery] = useState<OrdersQuery>(() => ({ date: today, channel: 'all', search: '', page: 1 }));
  const [result, setResult] = useState<OrdersResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [refundOrder, setRefundOrder] = useState<SalesOrder | null>(null);
  const [refundedOrder, setRefundedOrder] = useState<SalesOrder | null>(null);
  const refundFocusId = useRef<string | null>(null);

  useEffect(() => {
    if (!refundOrder && refundFocusId.current) {
      document.getElementById(`order-${refundFocusId.current}`)?.focus();
      refundFocusId.current = null;
    }
  }, [refundOrder]);

  async function refund(restoreStock: boolean) {
    if (!refundOrder) return;
    const updated = await service.refundOrder(refundOrder.id, restoreStock);
    setResult(current => current && ({ ...current, orders: current.orders.map(order => order.id === updated.id ? updated : order) }));
    setRefundedOrder(updated);
    refundFocusId.current = updated.id;
  }

  useEffect(() => {
    let active = true;
    setLoading(true); setError(false); setResult(null);
    service.listOrders(query).then(data => { if (active) setResult(data); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [service, query, retry]);

  function changeDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < '0001-01-01') return;
    setQuery(current => ({ ...current, date, page: 1 }));
  }
  function stepDate(delta: number) {
    const date = new Date(`${query.date}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    changeDate(date.toISOString().slice(0, 10));
  }
  function changeChannel(channel: OrderChannel) { setQuery(current => ({ ...current, channel, page: 1 })); }
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / ORDERS_PAGE_SIZE));

  return <div className={styles.page}>
    <PosHeader page="orders" initialHelp={false} />
    <main className={styles.body}>
      <div className={styles.dateRow}>
        <label className={styles.calendar}><CalendarIcon /><span className="sr-only">조회 날짜</span><input type="date" aria-label="조회 날짜" value={query.date} min="0001-01-01" max={today} onChange={event => changeDate(event.target.value)} /></label>
        <button type="button" className={styles.dateButton} aria-label="이전 날짜" disabled={query.date === '0001-01-01'} onClick={() => stepDate(-1)}><Image src={`${assets}/previous.svg`} alt="" width={16} height={16} /></button>
        <h2>{dateTitle(query.date)}</h2>
        <button type="button" className={styles.dateButton} aria-label="다음 날짜" disabled={query.date >= today} onClick={() => stepDate(1)}><Image src={`${assets}/next.svg`} alt="" width={16} height={16} /></button>
      </div>
      <div className={styles.filters}>
        <div className={styles.channels} role="group" aria-label="결제 구분">{channels.map(channel => <button key={channel.id} type="button" aria-pressed={query.channel === channel.id} onClick={() => changeChannel(channel.id)}>{channel.label}</button>)}</div>
        <label className={styles.search}><span className="sr-only">상품 검색</span><input type="search" placeholder="상품 검색" value={query.search} onChange={event => setQuery(current => ({ ...current, search: event.target.value, page: 1 }))} /><span className={styles.searchIcon}><Image src={`${assets}/search.svg`} alt="" width={20} height={20.458} /></span></label>
      </div>
      {result && <p className={styles.count} aria-live="polite">총 {result.total.toLocaleString('ko-KR')}건</p>}
      <section aria-label="주문 목록" aria-busy={loading}>
        {loading ? <p role="status" className={styles.empty}>주문을 불러오는 중입니다.</p>
          : error ? <div role="alert" className={styles.empty}><p>주문을 불러오지 못했어요.</p><button type="button" onClick={() => setRetry(current => current + 1)}>다시 불러오기</button></div>
            : result && !result.orders.length ? <p className={styles.empty}>{query.search.trim() ? '검색 결과가 없습니다.' : '주문 목록이 없습니다'}</p>
              : result && <div className={styles.tableScroll}><table className={styles.table}>
                <caption className="sr-only">{dateTitle(query.date)} Mock 주문 목록</caption>
                <colgroup><col className={styles.timeColumn} /><col className={styles.numberColumn} /><col /><col className={styles.methodColumn} /><col className={styles.amountColumn} /><col className={styles.refundColumn} /></colgroup>
                <thead><tr>{['주문시각', '주문번호', '상품명/옵션', '결제수단', '결제금액', '환불'].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead>
                <tbody>{result.orders.map(order => <tr key={order.id} id={`order-${order.id}`} tabIndex={-1}>
                  <td><time dateTime={order.orderedAt}>{time(order.orderedAt)}</time></td><td className={styles.orderNo}>{order.orderNo}</td>
                  <td><p className={styles.items} title={orderItemsText(order)}>{orderItemsText(order)}</p></td><td className={styles.bold}>{orderPaymentLabels[order.paymentMethod]}</td><td className={styles.bold}>{formatWon(order.paymentAmount)}</td>
                  <td>{order.refundStatus === 'none' ? <button type="button" aria-describedby="refund-note" className={styles.refund} onClick={() => { setRefundedOrder(null); setRefundOrder(order); }}>환불신청</button> : <span className={styles.refundState}>{order.refundStatus === 'pending' ? '환불 대기' : '환불 완료'}</span>}</td>
                </tr>)}</tbody>
              </table></div>}
      </section>
      {result && pages > 1 && <nav aria-label="주문 페이지" className={styles.pagination}>
        <button type="button" aria-label="이전 페이지" disabled={result.page <= 1} onClick={() => setQuery(current => ({ ...current, page: result.page - 1 }))}>이전</button>
        <span aria-live="polite">{result.page} / {pages}</span>
        <button type="button" aria-label="다음 페이지" disabled={result.page >= pages} onClick={() => setQuery(current => ({ ...current, page: result.page + 1 }))}>다음</button>
      </nav>}
      <div className={styles.notes}><p>Mock 예시 · 실제 주문 및 POS 판매 내역과 연결되지 않습니다.</p><p id="refund-note">환불 상태와 재고 선택만 기록하는 예시입니다. 실제 결제 취소·환불 및 상품 재고 변경은 실행되지 않습니다.</p>
        {refundedOrder && refundedOrder.paymentMethod !== 'online' && <p>{manualRefundHelp[refundedOrder.paymentMethod]}</p>}
      </div>
    </main>
    {refundedOrder && <div role="status" className={styles.refundToast}>
      <span className={styles.refundInfo}><Image src={`${assets}/refund-info.svg`} alt="" width={21.5} height={21.5} /></span>
      <p><span className="sr-only">Mock 예시 · </span>{refundedOrder.paymentMethod === 'online' ? '환불 처리되었습니다' : '결제수단에 맞는 방법으로 별도 환불을 진행해주세요'} ({refundedOrder.refundRestoreStock ? '재고 복원 완료' : '재고 유지'})</p>
    </div>}
    {refundOrder && <RefundDialog orderNo={refundOrder.orderNo} onRefund={refund} onDismiss={() => setRefundOrder(null)} />}
  </div>;
}
