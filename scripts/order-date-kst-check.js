const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const j = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? Number(v) : v));
const run = async (t, sql) => { console.log('---', t); try { for (const r of await p.$queryRawUnsafe(sql)) console.log(j(r)); } catch (e) { console.log('ERR', e.message.split('\n').slice(-2).join(' ')); } };
(async () => {
  await run('column types / db timezone', `select (select data_type from information_schema.columns where table_name='Order' and column_name='orderDate') order_date_type, (select data_type from information_schema.columns where table_name='Order' and column_name='createdAt') created_type, current_setting('TimeZone') tz`);
  await run('KST date via correct conversion (orderDate) vs stored orderDateKey', `select to_char(("orderDate" at time zone 'UTC') at time zone 'Asia/Seoul','YYYY-MM-DD (Dy)') kst_date, "orderDateKey", count(*)::int n, count(*) filter (where "paymentStatus"::text='PAID')::int paid, min(to_char(("orderDate" at time zone 'UTC') at time zone 'Asia/Seoul','HH24:MI')) first_t, max(to_char(("orderDate" at time zone 'UTC') at time zone 'Asia/Seoul','HH24:MI')) last_t from "Order" group by 1,2 order by 1,2`);
  await run('createdAt vs orderDate differences', `select count(*)::int total, count(*) filter (where abs(extract(epoch from ("createdAt"-"orderDate")))>60)::int differ_over_1min from "Order"`);
  await run('non-event-window orders (outside 4/2~4/5 KST)', `select o.id, to_char(("orderDate" at time zone 'UTC') at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI') kst, "orderDateKey", "paymentStatus"::text ps, "paymentAmount", (select count(*)::int from "OrderItem" oi where oi."orderId"=o.id) items from "Order" o where ("orderDate" at time zone 'UTC') at time zone 'Asia/Seoul' < '2026-04-02 00:00+09' or ("orderDate" at time zone 'UTC') at time zone 'Asia/Seoul' >= '2026-04-06 00:00+09' order by "orderDate"`);
})().finally(()=>p.$disconnect());
