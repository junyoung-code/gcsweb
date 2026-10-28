const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
class Rollback extends Error {}
const sql = fs.readFileSync('prisma/migrations/20261028030000_unify_shop_order_number/migration.sql', 'utf8');
const stmts = sql.split(/;\s*\n/).map((s) => s.replace(/^--.*$/gm, '').trim()).filter(Boolean);
const snap = (c) => c.$queryRawUnsafe(`select
  (select count(*)::int from "Order") orders,
  (select count(*)::int from "OrderItem") items,
  (select count(*)::int from "OrderNumber") order_numbers,
  (select count(*)::int from "Store") stores,
  (select count(*)::int from "Store" where "storeSlug"='goat') goat_store,
  (select count(*)::int from information_schema.columns where table_name='Order' and column_name in ('orderCode','orderDateKey','orderSeq','bagOption')) dropped_cols_left,
  (select count(*)::int from information_schema.tables where table_name in ('OrderSequence','FairShopProductTable')) dropped_tables_left`).then((r) => r[0]);
(async () => {
  console.log('BEFORE', JSON.stringify(await snap(p)));
  try {
    await p.$transaction(async (tx) => {
      for (const s of stmts) await tx.$executeRawUnsafe(s);
      console.log('IN TX ', JSON.stringify(await snap(tx)));
      throw new Rollback();
    }, { timeout: 60000 });
  } catch (e) { if (!(e instanceof Rollback)) { console.log('FAILED', e.message); process.exitCode = 1; } }
  console.log('AFTER ', JSON.stringify(await snap(p)));
})().finally(() => p.$disconnect());
