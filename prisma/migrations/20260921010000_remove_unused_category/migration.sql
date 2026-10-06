-- 미사용 Category 테이블 제거.
--
-- { id, category } 두 컬럼뿐이고 다른 모델과 관계가 없다. 서비스 코드에서
-- prisma.category 호출도, raw SQL의 "Category" 참조도 0건이었다.
-- 아카이브의 카테고리는 별도 모델(ProjectCategory, "Project Category" 테이블)을
-- 쓰므로 이 테이블과 무관하다.

DROP TABLE IF EXISTS "Category" CASCADE;
