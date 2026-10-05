-- AlterTable: Store gains an owner (User, 1:1).
-- userId is added nullable first, backfilled for the existing seed store, then made NOT NULL.
ALTER TABLE "Store" ADD COLUMN "userId" TEXT;

-- Store name is limited to 16 chars (existing row "열반급행" fits).
ALTER TABLE "Store" ALTER COLUMN "name" TYPE VARCHAR(16);

-- Backfill: the existing seed store (nirvanaexpress) is owned by this user.
-- Fails loudly instead of leaving an ownerless store or deleting data when the user does not exist
-- (e.g. a fresh database that only has the seed store).
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

-- CreateIndex
CREATE UNIQUE INDEX "Store_userId_key" ON "Store"("userId");

-- AddForeignKey: a user who owns a store cannot be deleted.
ALTER TABLE "Store" ADD CONSTRAINT "Store_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints: not representable in this Prisma version's schema syntax, enforced at the DB level here.
-- name: at least 1 char after trimming (app also trims). storeSlug: lowercase letters/digits, 4+ chars.
ALTER TABLE "Store" ADD CONSTRAINT "Store_name_not_blank"
    CHECK (char_length(btrim("name")) >= 1);
ALTER TABLE "Store" ADD CONSTRAINT "Store_storeSlug_format"
    CHECK ("storeSlug" ~ '^[a-z0-9]{4,}$');
