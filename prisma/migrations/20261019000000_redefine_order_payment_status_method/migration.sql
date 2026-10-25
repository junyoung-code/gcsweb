-- PR1: Order 결제상태·결제방법·수령상태를 enum으로 재정의 + 기존 데이터 변환
--
-- PaymentMethod  ONLINE(온라인) / ON_SITE(현장)
--   기존 0(카드)·1(계좌)·2(간편결제) → ONLINE,  3(현장결제) → ON_SITE
--   세부 PG 수단은 사이트가 나누지 않는다(cardCompany/bankCode/easyPayProvider 컬럼은 이번엔 유지).
-- PaymentStatus  PENDING(결제대기) / PAID(결제완료) / CANCELED(결제취소) / FAILED(결제실패)   (수령상태와 별개 축)
--   기존 0 CREATED, 1 UNPAID(현장)·결제완료(온라인), 2 PAID(현장 수령완료), 3 CANCELED, 4 FAILED
-- ReceiptStatus  NOT_RECEIVED(미수령) / RECEIVED(수령완료)
--   기존 fulfillmentStatus(Int?, NULL 또는 0 = 미수령, 1 = 수령완료)의 이름을 receiptStatus로 바꾸고 NOT NULL로 만든다.
--
-- 결제상태 변환 규칙
--   현장(기존 3):  1 미결제 → PENDING, 2 → PAID, 3 → CANCELED, 4 → FAILED
--                  단 1 미결제라도 수령완료로 표시된 건과, 주문 항목이 전부 뽑기인 건은 PAID.
--                  (레거시 어드민에는 결제완료 버튼이 없어 결제완료가 수령 처리에만 묶여 있었고,
--                   뽑기는 수령 단계가 없는 즉시 판매라 수령 버튼이 눌리지 않았다. 운영 기준 623건)
--   온라인:        1·2 → PAID, 3 → CANCELED, 4 → FAILED
--                  0 미검증 → 생성 후 1시간이 지난 건은 결제창 이탈/실패로 보고 FAILED,
--                             1시간 이내(진행 중일 수 있음)는 PENDING 유지
--                  예외: PortOne 조회로 결제 완료(PAID)가 확인된 5건은 PAID
--
-- 롤백이 필요하면 이 마이그레이션 직전 백업으로 복원한다(미검증→실패 변환은 비가역).

-- 1) 가드: 예상 밖 값(변환 전 기준)이 있으면 변환하지 않고 중단
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Order"
    WHERE "paymentMethod" NOT IN (0, 1, 2, 3) OR "paymentStatus" NOT IN (0, 1, 2, 3, 4)
  ) THEN
    RAISE EXCEPTION 'Order has unexpected paymentMethod/paymentStatus values; aborting redefinition';
  END IF;
END $$;

-- 2) 옛 상태값 보정: 항목이 전부 뽑기인 현장결제 미결제 주문 → 옛 PAID(2)로 올려둔다.
--    아래 타입 변환의 USING 식에는 서브쿼리를 쓸 수 없어서, 변환 전에 옛 정수 값을 먼저 맞춘다.
--    항목이 없는 주문은 대상이 아니다(EXISTS). 뽑기와 다른 상품이 섞인 주문은 PENDING으로 남는다.
UPDATE "Order" o
SET "paymentStatus" = 2
WHERE o."paymentMethod" = 3
  AND o."paymentStatus" = 1
  AND EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = o."id")
  AND NOT EXISTS (
    SELECT 1 FROM "OrderItem" oi
    WHERE oi."orderId" = o."id"
      AND COALESCE(oi."optionData"->>'optionValue', '') NOT LIKE '뽑기%'
  );

-- 3) enum 타입
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED', 'FAILED');
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'ON_SITE');
CREATE TYPE "ReceiptStatus" AS ENUM ('NOT_RECEIVED', 'RECEIVED');

-- 4) 숫자를 비교하던 기존 제약 제거 (enum이 허용 값을 직접 강제하므로 값 범위 제약은 새로 만들지 않는다)
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_paymentMethod_check";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_paymentStatus_check";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_paymentMethod_by_productType_check";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_payment_detail_by_method_check";

-- 5) 수령상태 컬럼/인덱스 이름 변경 (fulfillmentStatus → receiptStatus)
ALTER TABLE "Order" RENAME COLUMN "fulfillmentStatus" TO "receiptStatus";
ALTER INDEX "Order_fulfillmentStatus_idx" RENAME TO "Order_receiptStatus_idx";

-- 6) 타입 변환 + 데이터 변환
--    한 ALTER TABLE 안의 USING 식은 모두 변환 전 행 값을 기준으로 평가되므로,
--    결제상태가 기존 paymentMethod·receiptStatus 숫자 값을 그대로 참조할 수 있다.
ALTER TABLE "Order" ALTER COLUMN "paymentStatus" DROP DEFAULT;

ALTER TABLE "Order"
  ALTER COLUMN "paymentStatus" TYPE "PaymentStatus" USING (
    CASE
      WHEN "paymentMethod" = 3 THEN
        CASE
          WHEN "paymentStatus" = 3 THEN 'CANCELED'
          WHEN "paymentStatus" = 4 THEN 'FAILED'
          WHEN "paymentStatus" = 2 THEN 'PAID'
          WHEN "receiptStatus" = 1 THEN 'PAID'
          ELSE 'PENDING'
        END
      ELSE
        CASE
          WHEN "paymentStatus" = 3 THEN 'CANCELED'
          WHEN "paymentStatus" = 4 THEN 'FAILED'
          WHEN "paymentStatus" IN (1, 2) THEN 'PAID'
          WHEN "id" IN (
            'cmnh67lj10e8m1vlayi9wqqho',
            'cmnikzbku0114g6ufqbpxkmcu',
            'cmnil7sy600mjlut0nx3d869w',
            'cmnio3m4z01gkh846l82nsy16',
            'cmnl8lr2l0wmkakfw74o2tgt7'
          ) THEN 'PAID'
          WHEN "createdAt" < now() - interval '1 hour' THEN 'FAILED'
          ELSE 'PENDING'
        END
    END
  )::"PaymentStatus",
  ALTER COLUMN "paymentMethod" TYPE "PaymentMethod" USING (
    CASE WHEN "paymentMethod" = 3 THEN 'ON_SITE' ELSE 'ONLINE' END
  )::"PaymentMethod",
  ALTER COLUMN "receiptStatus" TYPE "ReceiptStatus" USING (
    CASE WHEN "receiptStatus" = 1 THEN 'RECEIVED' ELSE 'NOT_RECEIVED' END
  )::"ReceiptStatus";

ALTER TABLE "Order" ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';
ALTER TABLE "Order" ALTER COLUMN "receiptStatus" SET DEFAULT 'NOT_RECEIVED';
ALTER TABLE "Order" ALTER COLUMN "receiptStatus" SET NOT NULL;

-- 7) 새 제약 (enum 값 기준)
-- 펀딩(productType 0)은 온라인결제만 가능
ALTER TABLE "Order"
ADD CONSTRAINT "Order_paymentMethod_by_productType_check" CHECK (
  ("productType" = 0 AND "paymentMethod" = 'ONLINE')
  OR "productType" = 1
);

-- 현장결제는 세부 결제수단이 없고, 온라인은 세부 결제수단을 최대 1개만 가진다.
ALTER TABLE "Order"
ADD CONSTRAINT "Order_payment_detail_by_method_check" CHECK (
  ("paymentMethod" = 'ON_SITE' AND "cardCompany" IS NULL AND "bankCode" IS NULL AND "easyPayProvider" IS NULL)
  OR (
    "paymentMethod" = 'ONLINE'
    AND (("cardCompany" IS NOT NULL)::int + ("bankCode" IS NOT NULL)::int + ("easyPayProvider" IS NOT NULL)::int) <= 1
  )
);
