const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
class Rollback extends Error {}
const sql = fs.readFileSync('prisma/migrations/20261028020000_drop_legacy_qr_item_id/migration.sql', 'utf8');
const stmts = sql.split(/;\s*\n/).map((s) => s.replace(/^--.*$/gm, '').trim()).filter(Boolean);
const snap = (c) => c.$queryRawUnsafe(`select
  (select count(*)::int from information_schema.columns where column_name='legacyQrItemId' and table_name in ('OnsiteProduct','OnsiteProductOption')) legacy_cols,
  (select count(*)::int from pg_indexes where indexname like '%legacyQrItemId%') legacy_idx,
  (select count(*)::int from "OnsiteProduct") products,
  (select count(*)::int from "OnsiteProductOption") options,
  (select count(*)::int from "OnsiteProduct" where "legacyQrItemId" is not null) products_with_legacy,
  (select count(*)::int from "Order") orders, (select count(*)::int from "OrderItem") items`.replace(/ where "legacyQrItemId" is not null/, '')).then((r) => r[0]);
(async () => {
  const before = await p.$queryRawUnsafe(`select (select count(*)::int from "OnsiteProduct" where "legacyQrItemId" is not null) products_with_legacy, (select count(*)::int from "OnsiteProductOption" where "legacyQrItemId" is not null) options_with_legacy`);
  console.log('BEFORE legacy values:', JSON.stringify(before[0]), JSON.stringify(await snap(p)));
  try {
    await p.$transaction(async (tx) => {
      for (const s of stmts) await tx.$executeRawUnsafe(s);
      console.log('IN TX  ', JSON.stringify(await snap(tx)));
      throw new Rollback();
    }, { timeout: 60000 });
  } catch (e) { if (!(e instanceof Rollback)) { console.log('FAILED', e.message); process.exitCode = 1; } }
  console.log('AFTER  ', JSON.stringify(await snap(p)));
})().finally(() => p.$disconnect());
