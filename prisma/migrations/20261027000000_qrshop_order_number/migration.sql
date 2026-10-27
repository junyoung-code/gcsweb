-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('PRE_ORDER', 'ONSITE');

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "refundFailedAt" TIMESTAMP(3),
ALTER COLUMN "productType" DROP NOT NULL,
ALTER COLUMN "receiveMethod" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "onsiteOptionName" TEXT,
ADD COLUMN     "onsiteProductName" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "OrderNumber" (
    "orderId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "type" "OrderType" NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderTimeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderNumber_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE INDEX "OrderNumber_storeId_orderTimeKey_idx" ON "OrderNumber"("storeId", "orderTimeKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderNumber_storeId_orderTimeKey_orderNo_key" ON "OrderNumber"("storeId", "orderTimeKey", "orderNo");

-- AddForeignKey
ALTER TABLE "OrderNumber" ADD CONSTRAINT "OrderNumber_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNumber" ADD CONSTRAINT "OrderNumber_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

