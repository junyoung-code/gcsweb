-- OrderItem.productType 삭제. /shop 상품 유형(0 펀딩 / 1 BuyNow) 스냅샷이었으나 읽는 코드가 없고,
-- /shop 주문은 한 주문에 유형을 섞지 못하므로 Order.productType 과 값이 같다. CHECK(OrderItem_productType_check)는 컬럼과 함께 삭제된다.
-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "productType";
