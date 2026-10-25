-- 미구현 정산(Settlement) 테이블 삭제.
-- 2026-01-29 ERDCloud 설계에서 스키마만 들어왔고 코드에서 한 번도 쓰이지 않았다(API·화면·prisma 호출 0건).
-- 다른 테이블이 이 테이블을 참조하지 않는다(Settlement → Team FK만 존재).
--
-- 가드: 행이 하나라도 있으면 데이터를 지우지 않고 중단한다.
--       행이 있다면 백업·이관 여부를 먼저 정한 뒤 이 마이그레이션을 다시 적용한다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Settlement") THEN
    RAISE EXCEPTION 'Settlement has rows; refusing to drop. Back up or migrate the data first.';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "Settlement" DROP CONSTRAINT "Settlement_teamId_fkey";

-- DropTable
DROP TABLE "Settlement";
