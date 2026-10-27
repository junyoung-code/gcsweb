const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const j = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? Number(v) : v));
class Rollback extends Error {}
const PLACEHOLDER = 'cmnd8kx0l002rxza62xe0ysg4';
const snap = (c) => c.$queryRawUnsafe(`select
  (select count(*)::int from "Order") orders,
  (select count(*)::int from "OrderItem") items,
  (select count(*)::int from "Order" where "paymentStatus"::text='PAID') paid,
  (select coalesce(sum("paymentAmount"),0)::bigint from "Order") sum_amount,
  (select coalesce(sum("paymentAmount"),0)::bigint from "Order" where "paymentStatus"::text='PAID') paid_amount,
  (select coalesce(sum(price*quantity),0)::bigint from "OrderItem") sum_lines,
  (select count(*)::int from "OrderItem" where "onsiteProductId" is null) items_without_onsite_product,
  (select count(*)::int from "OrderItem" where "onsiteProductName" is null) items_without_name,
  (select count(*)::int from "OrderItem" where "optionData" is not null) items_with_optiondata,
  (select count(*)::int from "OrderItem" where "productId" is not null) items_with_product_fk,
  (select count(*)::int from "OrderNumber") order_numbers,
  (select count(*)::int from "Product") products,
  (select count(*)::int from "ProductImage") product_images`).then(r => r[0]);
(async () => {
  const before = await snap(p);
  console.log('BEFORE ', j(before));
  let inTx;
  try {
    await p.$transaction(async (tx) => {
      const del = await tx.$executeRawUnsafe(`DELETE FROM "Product" WHERE id = '${PLACEHOLDER}' AND name = '불교박람회판매'`);
      console.log('deleted Product rows:', del);
      inTx = await snap(tx);
      throw new Rollback();
    }, { timeout: 60000 });
  } catch (e) { if (!(e instanceof Rollback)) { console.log('FAILED', e.message); process.exitCode = 1; } }
  console.log('IN TX  ', j(inTx));
  const after = await snap(p);
  console.log('AFTER  ', j(after));
  const same = (a, b) => ['orders','items','paid','sum_amount','paid_amount','sum_lines','items_without_onsite_product','items_without_name','items_with_optiondata','order_numbers'].every(k => String(a[k]) === String(b[k]));
  console.log('order data identical before vs in-tx:', same(before, inTx));
  console.log('rolled back (before == after):', j(before) === j(after));
})().finally(() => p.$disconnect());
