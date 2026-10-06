-- Store owner becomes mandatory. Builds on 20260922000000_add_store_owner_and_option_surcharge,
-- which already added Store.userId (nullable, unique, FK ON DELETE SET NULL), handle and imageUrl.

-- Fresh database (no users at all, e.g. CI or a new local DB): the seed migration created the
-- nirvanaexpress store, but its owner does not exist yet. Create a placeholder owner with the same id
-- so the backfill below works. Never runs on a database that already has users (production, shared dev DBs).
INSERT INTO "User" ("id", "email", "nickname", "name", "updatedAt")
SELECT 'cmn04r97r0000p0pgamvus27r', 'seed-owner@example.invalid', 'seed-owner', 'seed owner', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "User");

-- Backfill: the existing seed store (nirvanaexpress) is owned by this user.
-- Fails loudly instead of leaving an ownerless store or deleting data when the user does not exist
-- but other users do (set Store.userId of that store to an existing user and re-run).
DO $$
BEGIN
    UPDATE "Store" SET "userId" = 'cmn04r97r0000p0pgamvus27r'
    WHERE "storeSlug" = 'nirvanaexpress'
      AND "userId" IS NULL
      AND EXISTS (SELECT 1 FROM "User" WHERE "id" = 'cmn04r97r0000p0pgamvus27r');

    IF EXISTS (SELECT 1 FROM "Store" WHERE "userId" IS NULL) THEN
        RAISE EXCEPTION 'Store rows without an owner exist; set Store.userId before making it NOT NULL';
    END IF;
END $$;

ALTER TABLE "Store" ALTER COLUMN "userId" SET NOT NULL;

-- A user who owns a store cannot be deleted (was ON DELETE SET NULL).
ALTER TABLE "Store" DROP CONSTRAINT "Store_userId_fkey";
ALTER TABLE "Store" ADD CONSTRAINT "Store_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- handle (added by 20260922000000) duplicates storeSlug, which is the displayed id: drop it.
-- Dropping it also drops its unique index (Store_handle_key). Existing values are discarded
-- (the seed store has none; databases where stores were created through the removed v1 seller API would lose them).
-- imageUrl (same migration) is kept as is.
ALTER TABLE "Store" DROP COLUMN "handle";

-- Store name is limited to 16 chars (existing row "열반급행" fits).
ALTER TABLE "Store" ALTER COLUMN "name" TYPE VARCHAR(16);

-- CHECK constraints: not representable in this Prisma version's schema syntax, enforced at the DB level here.
-- name: at least 1 char after trimming (app also trims). storeSlug: lowercase letters/digits, 4+ chars.
ALTER TABLE "Store" ADD CONSTRAINT "Store_name_not_blank"
    CHECK (char_length(btrim("name")) >= 1);
ALTER TABLE "Store" ADD CONSTRAINT "Store_storeSlug_format"
    CHECK ("storeSlug" ~ '^[a-z0-9]{4,}$');
