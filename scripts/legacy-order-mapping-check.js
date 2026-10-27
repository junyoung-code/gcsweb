const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const j = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? Number(v) : v));
const run = async (t, sql) => { console.log('---', t); try { for (const r of await p.$queryRawUnsafe(sql)) console.log(j(r)); } catch (e) { console.log('ERR', e.message.split('\n').slice(-2).join(' ')); } };
const LINES = `(select oi.id, oi."orderId", oi."optionData"->>'qrItemId' q, oi.price, oi.quantity from "OrderItem" oi where oi."optionData"->>'source'='qrshop')`;
(async () => {
  await run('OnsiteProduct/Option columns', `select table_name, string_agg(column_name,',' order by ordinal_position) cols from information_schema.columns where table_name in ('OnsiteProduct','OnsiteProductOption') group by 1`);
  await run('legacy ids containing # (product / option)', `select 'product' k, count(*)::int n from "OnsiteProduct" where "legacyQrItemId" like '%#%' union all select 'option', count(*)::int from "OnsiteProductOption" where "legacyQrItemId" like '%#%'`);
  await run('distinct (qrItemId, unit price) per qrItemId having >1 price in orders', `select q, count(distinct price)::int prices, string_agg(distinct price::text, ',') price_list from ${LINES} l group by q having count(distinct price)>1 order by q`);
  await run('mapping coverage by line', `
    select case when m.kind is null then 'NONE' else m.kind end kind, count(*)::int lines, count(distinct l.q)::int ids
    from ${LINES} l
    left join lateral (
      select kind from (
        select 1 ord, 'option_exact' kind from "OnsiteProductOption" oo where oo."legacyQrItemId" = l.q
        union all select 2, 'option_hash' from "OnsiteProductOption" oo where oo."legacyQrItemId" = l.q||'#'||l.price
        union all select 3, 'product_exact' from "OnsiteProduct" op where op."legacyQrItemId" = l.q
        union all select 4, 'product_hash' from "OnsiteProduct" op where op."legacyQrItemId" = l.q||'#'||l.price
      ) s order by ord limit 1) m on true
    group by 1 order by 1`);
  await run('multiple matches per line (ambiguity)', `
    select count(*)::int lines_with_multi from (select l.id from ${LINES} l
      left join "OnsiteProductOption" oo on oo."legacyQrItemId" in (l.q, l.q||'#'||l.price)
      left join "OnsiteProduct" op on op."legacyQrItemId" in (l.q, l.q||'#'||l.price)
      group by l.id having count(oo."optionId") + count(op."productId") > 1) x`);
  await run('price check: option lines (unit price vs product.price+surcharge)', `
    select count(*)::int lines, count(*) filter (where l.price = op.price + oo.surcharge)::int price_ok, count(*) filter (where l.price <> op.price + oo.surcharge)::int price_mismatch
    from ${LINES} l join "OnsiteProductOption" oo on oo."legacyQrItemId" in (l.q, l.q||'#'||l.price) join "OnsiteProduct" op on op."productId"=oo."productId"`);
  await run('price mismatch samples (option)', `
    select l.q, l.price line_price, op.price base_price, oo.surcharge, oo."legacyQrItemId" legacy, count(*)::int n
    from ${LINES} l join "OnsiteProductOption" oo on oo."legacyQrItemId" in (l.q, l.q||'#'||l.price) join "OnsiteProduct" op on op."productId"=oo."productId"
    where l.price <> op.price + oo.surcharge group by 1,2,3,4,5 order by n desc limit 15`);
  await run('price check: no-option product lines', `
    select count(*)::int lines, count(*) filter (where l.price = op.price)::int price_ok, count(*) filter (where l.price <> op.price)::int price_mismatch
    from ${LINES} l join "OnsiteProduct" op on op."legacyQrItemId" in (l.q, l.q||'#'||l.price)`);
  await run('price mismatch samples (no-option product)', `
    select l.q, l.price line_price, op.price base_price, op."legacyQrItemId" legacy, count(*)::int n
    from ${LINES} l join "OnsiteProduct" op on op."legacyQrItemId" in (l.q, l.q||'#'||l.price) where l.price <> op.price group by 1,2,3,4 order by n desc limit 15`);
  await run('is OrderItem.price a unit price? PAID order sum(price*qty) vs paymentAmount', `
    select count(*)::int paid_orders, count(*) filter (where s.sum_unit = o."paymentAmount")::int unit_ok, count(*) filter (where s.sum_line = o."paymentAmount")::int line_ok
    from "Order" o join (select "orderId", sum(price*quantity)::int sum_unit, sum(price)::int sum_line from "OrderItem" group by 1) s on s."orderId"=o.id where o."paymentStatus"::text='PAID'`);
})().finally(()=>p.$disconnect());
