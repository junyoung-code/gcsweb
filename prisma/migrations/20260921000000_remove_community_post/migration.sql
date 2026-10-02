-- 커뮤니티(Board/Lounge) 기능 제거.
--
-- 3차개발 「gcsweb에서 없어질 것」 리스트의 "커뮤니티 / Board 탭" 항목.
-- 리뷰/뉴스와 동일한 절차(db 테이블 삭제 -> 엠티뷰 라우트 삭제 -> ERD 정리)를 따른다.
-- Post는 Board(category 0)와 Lounge(category 1)를 함께 담고 있었고, 서비스 코드에서
-- prisma.post 호출은 0건이었다.
--
-- 20260824130000 (News/Review 제거)과 같은 방식으로 idempotent하게 작성한다.

-- CASCADE가 Post에 딸린 FK/인덱스(Post->User, Like.postId->Post, Scrap.postId->Post)도 같이 정리한다.
DROP TABLE IF EXISTS "Post" CASCADE;

-- Like.postId / Scrap.postId: 컬럼을 지우면 남아 있던 FK와 unique 인덱스도 함께 사라진다.
ALTER TABLE "Like" DROP COLUMN IF EXISTS "postId";
ALTER TABLE "Scrap" DROP COLUMN IF EXISTS "postId";
