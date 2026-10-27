-- QR샵 기존 주문(2026-04-02~05 행사, 열반급행) 이관
--   1) 행사 기간 밖 FAILED 주문 5건 삭제 (4/6, 4/13, 5/9 2건, 9/12 테스트)
--   2) 남은 주문 전부에 OrderNumber 생성: 열반급행, ONSITE, KST 일자별로 생성시각 순 1부터
--   3) OrderItem 의 상품·옵션 FK 와 이름 스냅샷 채움 (optionData.qrItemId -> legacyQrItemId, 가격 변경분은 'qrItemId#단가')
-- 상점·주문이 없는 DB(신규 개발 DB)에서는 아무 것도 하지 않는다.
DO $$
DECLARE
  v_store      text;
  v_orders     int;
  v_non_qr     int;
  v_ambiguous  int;
  v_unmatched  int;
BEGIN
  SELECT count(*) INTO v_orders FROM "Order";
  IF v_orders = 0 THEN
    RETURN;
  END IF;

  SELECT "storeId" INTO v_store FROM "Store" WHERE "storeSlug" = 'nirvanaexpress';
  IF v_store IS NULL THEN
    RAISE EXCEPTION '열반급행 상점(nirvanaexpress)을 찾을 수 없습니다';
  END IF;

  -- 1) 행사 기간 밖 FAILED 주문 삭제 (OrderItem 은 cascade, Inquiry.orderId 는 SET NULL)
  DELETE FROM "Order"
  WHERE "paymentStatus" = 'FAILED'
    AND "id" IN (
      'cmnlwexrl03wjh3kefstzp299',
      'cmnwmhdk509i7h3kevpdq9uoq',
      'cmoxx9fs10aojh3ke2bcg7yr5',
      'cmoxxbb1e0areh3keyjv7nphk',
      'cmtyff6lz004g2jne0zxkqt0n'
    );

  -- 남은 주문 항목이 전부 QR샵 항목인지 확인
  SELECT count(*) INTO v_non_qr
  FROM "OrderItem" oi
  WHERE oi."optionData"->>'source' IS DISTINCT FROM 'qrshop';
  IF v_non_qr > 0 THEN
    RAISE EXCEPTION 'QR샵이 아닌 주문 항목 %건이 남아 있어 이관을 중단합니다', v_non_qr;
  END IF;

  -- 2) 주문번호
  INSERT INTO "OrderNumber" ("orderId", "orderNo", "type", "storeId", "orderTimeKey", "createdAt")
  SELECT k."id",
         row_number() OVER (PARTITION BY k."key" ORDER BY k."createdAt", k."id"),
         'ONSITE'::"OrderType",
         v_store,
         k."key",
         k."createdAt"
  FROM (
    SELECT o."id", o."createdAt",
           to_char((o."orderDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul', 'YYMMDD') AS "key"
    FROM "Order" o
    WHERE NOT EXISTS (SELECT 1 FROM "OrderNumber" n WHERE n."orderId" = o."id")
  ) k;

  -- 3) 상품·옵션 매칭. 한 항목에 둘 이상 매칭되면 중단
  SELECT count(*) INTO v_ambiguous
  FROM (
    SELECT oi."id"
    FROM "OrderItem" oi
    LEFT JOIN "OnsiteProductOption" oo
      ON oo."legacyQrItemId" IN (oi."optionData"->>'qrItemId', (oi."optionData"->>'qrItemId') || '#' || oi."price")
    LEFT JOIN "OnsiteProduct" op
      ON op."legacyQrItemId" = oi."optionData"->>'qrItemId'
    WHERE oi."onsiteProductId" IS NULL
    GROUP BY oi."id"
    HAVING count(oo."optionId") + count(op."productId") > 1
  ) x;
  IF v_ambiguous > 0 THEN
    RAISE EXCEPTION '상품·옵션이 둘 이상 매칭되는 주문 항목 %건', v_ambiguous;
  END IF;

  -- 옵션 상품
  UPDATE "OrderItem" oi
  SET "onsiteOptionId"    = oo."optionId",
      "onsiteProductId"   = oo."productId",
      "onsiteProductName" = op."name",
      "onsiteOptionName"  = oo."name"
  FROM "OnsiteProductOption" oo
  JOIN "OnsiteProduct" op ON op."productId" = oo."productId"
  WHERE oi."onsiteProductId" IS NULL
    AND oo."legacyQrItemId" IN (oi."optionData"->>'qrItemId', (oi."optionData"->>'qrItemId') || '#' || oi."price");

  -- 옵션 없는 상품
  UPDATE "OrderItem" oi
  SET "onsiteProductId"   = op."productId",
      "onsiteProductName" = op."name"
  FROM "OnsiteProduct" op
  WHERE oi."onsiteProductId" IS NULL
    AND op."legacyQrItemId" = oi."optionData"->>'qrItemId';

  SELECT count(*) INTO v_unmatched FROM "OrderItem" WHERE "onsiteProductId" IS NULL;
  IF v_unmatched > 0 THEN
    RAISE EXCEPTION '상품에 매칭되지 않은 주문 항목 %건', v_unmatched;
  END IF;
END
$$;
