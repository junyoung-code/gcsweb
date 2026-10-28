-- /shop 주문번호를 QR샵과 같은 OrderNumber 규칙(상점·KST 일별 순번)으로 통합한다.
-- /shop 주문은 플레이스홀더 상점(slug goat)의 주문으로 처리한다.
INSERT INTO "Store" ("storeId", "name", "storeSlug", "createdAt", "updatedAt")
VALUES ('gcsweb_shop_placeholder', 'gcsweb shop', 'goat', now(), now());

-- 옛 주문번호(orderCode/OrderSequence)·봉투 옵션(bagOption)·옛 QR샵 재고표(FairShopProductTable) 삭제.
-- 기존 주문 3,103건은 이미 OrderNumber 를 갖고 있고 orderNo 가 옛 orderSeq 와 같다.
-- DropIndex
DROP INDEX "Order_orderCode_key";

-- DropIndex
DROP INDEX "Order_orderDateKey_productType_idx";

-- DropIndex
DROP INDEX "Order_orderDateKey_productType_orderSeq_key";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "bagOption",
DROP COLUMN "orderCode",
DROP COLUMN "orderDateKey",
DROP COLUMN "orderSeq";

-- DropTable
DROP TABLE "FairShopProductTable";

-- DropTable
DROP TABLE "OrderSequence";

