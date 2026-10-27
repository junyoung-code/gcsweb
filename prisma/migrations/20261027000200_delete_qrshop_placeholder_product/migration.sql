-- v1 QR샵이 주문 항목마다 연결해 두던 플레이스홀더 상품(불교박람회판매, 테스트 상품) 삭제.
-- OrderItem.productId 는 ON DELETE SET NULL 이라 주문 항목은 남고 productId 만 비워진다. ProductImage 는 cascade 로 함께 삭제된다.
-- 주문 항목이 onsiteProductId 없이 이 상품에만 묶여 있으면 상품 정보를 잃으므로 중단한다.
DO $$
DECLARE
  v_orphaned int;
BEGIN
  SELECT count(*) INTO v_orphaned
  FROM "OrderItem" oi
  WHERE oi."productId" = 'cmnd8kx0l002rxza62xe0ysg4'
    AND oi."onsiteProductId" IS NULL;
  IF v_orphaned > 0 THEN
    RAISE EXCEPTION '상품 정보가 이 플레이스홀더에만 있는 주문 항목 %건이 있어 삭제를 중단합니다', v_orphaned;
  END IF;

  DELETE FROM "Product"
  WHERE "id" = 'cmnd8kx0l002rxza62xe0ysg4'
    AND "name" = '불교박람회판매';
END
$$;
