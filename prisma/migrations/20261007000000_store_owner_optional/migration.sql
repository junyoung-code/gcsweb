-- Store owner becomes optional again: a store with sales history is kept ownerless
-- when its owner (User) is deleted. Stores without sales history are deleted together with the owner
-- by the application (admin member delete), so only the FK action and nullability change here.
ALTER TABLE "Store" ALTER COLUMN "userId" DROP NOT NULL;

-- was ON DELETE RESTRICT
ALTER TABLE "Store" DROP CONSTRAINT "Store_userId_fkey";
ALTER TABLE "Store" ADD CONSTRAINT "Store_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
