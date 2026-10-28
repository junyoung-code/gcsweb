const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
class Rollback extends Error {}
const sql = fs.readFileSync('prisma/migrations/20261028000000_onsite_option_created_at/migration.sql', 'utf8');
const stmts = sql.split(/;\s*\n/).map(s => s.replace(/^--.*$/gm, '').trim()).filter(Boolean);
const cols = (c) => c.$queryRawUnsafe(`select column_name from information_schema.columns where table_name='OnsiteProductOption' and column_name='createdAt'`);
const check = (c) => c.$queryRawUnsafe(`
  with o as (select "optionId","productId",name,"createdAt",
    row_number() over (partition by "productId" order by "createdAt","optionId") a,
    row_number() over (partition by "productId" order by name collate "C") b
    from "OnsiteProductOption")
  select count(*)::int total, count(*) filter (where a<>b)::int mismatched,
    (select count(*)::int from (select "productId","createdAt" from "OnsiteProductOption" group by 1,2 having count(*)>1) d) dup_times,
    (select count(*)::int from "OnsiteProductOption" o2 join "OnsiteProduct" p on p."productId"=o2."productId" where o2."createdAt" > now()) in_future from o`);
(async () => {
  console.log('BEFORE col exists:', (await cols(p)).length);
  try {
    await p.$transaction(async (tx) => {
      for (const s of stmts) await tx.$executeRawUnsafe(s);
      console.log('IN TX col exists:', (await cols(tx)).length);
      console.log('IN TX check:', JSON.stringify((await check(tx))[0]));
      throw new Rollback();
    }, { timeout: 60000 });
  } catch (e) { if (!(e instanceof Rollback)) { console.log('FAILED', e.message); process.exitCode = 1; } }
  console.log('AFTER col exists:', (await cols(p)).length);
})().finally(() => p.$disconnect());
