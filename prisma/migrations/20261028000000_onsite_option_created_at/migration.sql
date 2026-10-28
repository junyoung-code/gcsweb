-- 옵션 노출 순서를 등록순(오래된 등록이 위)으로 하기 위한 등록 시각.
-- 기존 옵션은 등록 시각이 없으므로, 이관 시드 입력 순서(= 상품 내 옵션명 순)대로 상품 등록 시각부터 1ms 간격으로 채운다.
ALTER TABLE "OnsiteProductOption" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "OnsiteProductOption" o
SET "createdAt" = r."baseAt" + (r."rn" * INTERVAL '1 millisecond')
FROM (
  SELECT o2."optionId",
         p."createdAt" AS "baseAt",
         ROW_NUMBER() OVER (PARTITION BY o2."productId" ORDER BY o2."name" COLLATE "C") AS "rn"
  FROM "OnsiteProductOption" o2
  JOIN "OnsiteProduct" p ON p."productId" = o2."productId"
) r
WHERE o."optionId" = r."optionId";
