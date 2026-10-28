-- item.json 이관 추적용 임시 컬럼 삭제 (이관·레거시 주문 이관 검증 완료)
DROP INDEX "OnsiteProduct_legacyQrItemId_key";
DROP INDEX "OnsiteProductOption_legacyQrItemId_key";
ALTER TABLE "OnsiteProduct" DROP COLUMN "legacyQrItemId";
ALTER TABLE "OnsiteProductOption" DROP COLUMN "legacyQrItemId";
