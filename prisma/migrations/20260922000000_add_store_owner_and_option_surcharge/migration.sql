-- 3차개발 판매자 화면(Figma 23개)을 받치기 위한 스키마 변경.
--
-- 1) Store 에 소유자(userId, 1인 1상점) / 표시용 handle / 프로필 이미지 추가
-- 2) OnsiteProduct 에 대표 이미지 추가
-- 3) 옵션 금액을 절대가격에서 "기본가 + 추가금" 모델로 전환
--    - OnsiteProduct.price/initStock/currentStock 를 NOT NULL 로 (옵션 사용 시에도 기본가 유지)
--    - OnsiteProductOption.price -> surcharge (기본가에 더하는 금액)
--
-- 주의: 3)은 기존 시딩 데이터(상품 41 / 옵션 57)의 의미를 바꾸므로 백필이 필요하다.
--       변환 규칙은 최종가를 보존한다: 기본가 = 옵션 최저가, 추가금 = 옵션가 - 기본가.

-- ---------------------------------------------------------------------------
-- 1) Store: 소유자 / handle / 프로필 이미지
-- ---------------------------------------------------------------------------
ALTER TABLE "Store" ADD COLUMN "userId" TEXT;
ALTER TABLE "Store" ADD COLUMN "handle" TEXT;
ALTER TABLE "Store" ADD COLUMN "imageUrl" TEXT;

CREATE UNIQUE INDEX "Store_userId_key" ON "Store"("userId");
CREATE UNIQUE INDEX "Store_handle_key" ON "Store"("handle");

ALTER TABLE "Store" ADD CONSTRAINT "Store_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2) OnsiteProduct: 대표 이미지
-- ---------------------------------------------------------------------------
ALTER TABLE "OnsiteProduct" ADD COLUMN "imageUrl" TEXT;

-- ---------------------------------------------------------------------------
-- 3) 옵션 금액 모델 전환
-- ---------------------------------------------------------------------------

-- 3-1. 기존 CHECK 제약 해제 (NULL 허용을 전제로 걸려 있어 백필을 막는다)
ALTER TABLE "OnsiteProduct" DROP CONSTRAINT IF EXISTS "OnsiteProduct_price_nonnegative";
ALTER TABLE "OnsiteProduct" DROP CONSTRAINT IF EXISTS "OnsiteProduct_initStock_nonnegative";
ALTER TABLE "OnsiteProduct" DROP CONSTRAINT IF EXISTS "OnsiteProduct_currentStock_nonnegative";
ALTER TABLE "OnsiteProductOption" DROP CONSTRAINT IF EXISTS "OnsiteProductOption_price_nonnegative";

-- 3-2. 옵션을 쓰는 상품의 상품 레벨 값 백필.
--      기본가는 옵션 최저가, 재고는 옵션 재고 합계.
UPDATE "OnsiteProduct" p
SET "price"        = COALESCE(agg."minPrice", 0),
    "initStock"    = COALESCE(agg."sumInit", 0),
    "currentStock" = COALESCE(agg."sumCurrent", 0)
FROM (
    SELECT "productId",
           MIN("price")        AS "minPrice",
           SUM("initStock")    AS "sumInit",
           SUM("currentStock") AS "sumCurrent"
    FROM "OnsiteProductOption"
    GROUP BY "productId"
) AS agg
WHERE p."productId" = agg."productId"
  AND p."hasOption" = true;

-- 옵션이 하나도 없는데 hasOption=true 인 상품은 0으로 채운다(정상 데이터라면 없어야 한다).
UPDATE "OnsiteProduct"
SET "price"        = COALESCE("price", 0),
    "initStock"    = COALESCE("initStock", 0),
    "currentStock" = COALESCE("currentStock", 0)
WHERE "price" IS NULL OR "initStock" IS NULL OR "currentStock" IS NULL;

-- 3-3. 상품 레벨 값을 NOT NULL 로
ALTER TABLE "OnsiteProduct" ALTER COLUMN "price" SET NOT NULL;
ALTER TABLE "OnsiteProduct" ALTER COLUMN "initStock" SET NOT NULL;
ALTER TABLE "OnsiteProduct" ALTER COLUMN "currentStock" SET NOT NULL;

-- 3-4. 옵션 price -> surcharge 로 전환.
--      컬럼을 새로 만들고 (옵션가 - 상품 기본가) 로 채운 뒤 기존 컬럼을 버린다.
ALTER TABLE "OnsiteProductOption" ADD COLUMN "surcharge" INTEGER NOT NULL DEFAULT 0;

UPDATE "OnsiteProductOption" o
SET "surcharge" = GREATEST(o."price" - p."price", 0)
FROM "OnsiteProduct" p
WHERE o."productId" = p."productId";

ALTER TABLE "OnsiteProductOption" DROP COLUMN "price";

-- 3-5. CHECK 제약 재설정 (이제 NULL 을 허용하지 않는다)
ALTER TABLE "OnsiteProduct" ADD CONSTRAINT "OnsiteProduct_price_nonnegative"
    CHECK ("price" >= 0);
ALTER TABLE "OnsiteProduct" ADD CONSTRAINT "OnsiteProduct_initStock_nonnegative"
    CHECK ("initStock" >= 0);
ALTER TABLE "OnsiteProduct" ADD CONSTRAINT "OnsiteProduct_currentStock_nonnegative"
    CHECK ("currentStock" >= 0);
ALTER TABLE "OnsiteProductOption" ADD CONSTRAINT "OnsiteProductOption_surcharge_nonnegative"
    CHECK ("surcharge" >= 0);
