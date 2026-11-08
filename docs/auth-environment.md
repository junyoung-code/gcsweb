# 인증·판매관리 연동 환경

> 2026-11-07 통합 갱신: upstream/main `c4ba954`의 v2 API·Prisma 스키마·마이그레이션을 프론트에 통합했다. 아래 세션별 기록 중 “서버/스키마 미이관”은 과거 상태다. 로컬에서는 PR DB에 기존 마이그레이션을 적용하고 `.env.local`을 설정한 뒤 API 모드로 실행한다.
> `NEXTAUTH_URL=http://localhost:3000`, `NEXT_PUBLIC_SALES_MANAGEMENT_DATA_SOURCE=api`. Next.js는 `.env.local`을 읽지만 Prisma CLI는 자동으로 읽지 않으므로 같은 DB 환경을 명시적으로 로드해야 한다. 팀 공유 PR DB에는 `migrate dev`/`db push` 대신 검토한 기존 마이그레이션을 `migrate deploy`로 적용한다.
> 이메일 로그인부터 검증한다. 카카오·Brevo·PortOne 키를 복사하거나 실결제를 실행하지 않는다. POS·직원·판매자 전체 주문조회·환불은 계속 Mock 범위다.

기준: `junyoung`의 `13dc5e5`, API 계약 확인: `upstream/main`의 `c4ba954`.
이 작업은 기존 NextAuth 인증과 판매관리 진입을 연결한다. 판매관리 데이터는 기존 Mock Service를 사용한다.

## 설정과 로컬 실행

새 checkout에서는 lockfile 기준 `npm ci`로 설치한다. `postinstall`은 `prisma generate`이며 DB 스키마를 변경하지 않는다.
이번 작업의 별도 worktree는 기존 `worktrees/junyoung-integration/node_modules`를 링크해 재사용했으며 설치·업데이트하지 않았다.

1. `.env.example`을 `.env.local`로 복사하고 실제 값은 로컬 파일에만 설정한다.
2. 이메일 로그인에는 `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`이 필요하다. `NEXTAUTH_URL`은 현재 앱의 origin(로컬 기본 `http://localhost:3000`)으로 설정한다. `NEXTAUTH_SECRET`은 로컬에서 `openssl rand -base64 32` 등으로 생성하고 공유·커밋하지 않는다.
3. `DATABASE_URL`에는 현재 브랜치 스키마가 준비된 별도 개발 DB를 사용한다. 이 문서의 절차에서 `db:push`, migration, seed를 실행하지 않는다. DB 준비는 담당자에게 요청한다.
4. 카카오 로그인에는 `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`과 카카오 앱의 `${NEXTAUTH_URL}/api/auth/callback/kakao` redirect URI 등록이 추가로 필요하다. 이메일 가입·인증·재설정에는 `BREVO_API_KEY`, `BREVO_FROM_EMAIL`이 추가로 필요하다.
5. 설정 후 `npm run dev`로 실행한다. 기존의 개발 새로고침 강제 로그아웃은 제거했으므로 실제 NextAuth 세션 수명에 따른다.

프론트 Mock 화면 테스트는 DB/OAuth/Brevo 설정 없이 실행할 수 있다. 실제 로그인 성공에는 DB 사용자와 유효한 자격 증명이 필요하며 Mock 인증 우회는 없다.
`npm run build`는 `prisma generate && next build`, `npm start`는 **`prisma migrate deploy && next start`** 이므로 단순 화면 확인 목적으로 `npm start`를 실행하지 않는다.

## 현재 인증과 접근 계약

| 경계 | 준비된 계약과 적용 |
| --- | --- |
| 이메일 로그인 | `POST /api/v1/auth/login`에 `{ email, password }`를 보내 실패 횟수·잠금을 처리한 뒤 기존 `signIn('credentials')`로 NextAuth 쿠키 세션을 만든다. API 응답의 access/refresh token을 별도 클라이언트 저장소에 보관하지 않는다. |
| 로그인 실패 | `AUTH_FAILED`(401)는 실패 횟수, `ACCOUNT_LOCKED`(403)는 `meta.lockedUntil`과 재시도 차단, `SERVER_ERROR`(500)·네트워크·세션 생성 실패는 일반 오류로 처리한다. |
| NextAuth | `lib/auth.ts`와 `types/next-auth.d.ts`는 upstream과 동일하다. `session.user.id`는 DB `User.id`; role은 `memberType === 2`일 때 `admin`, 그 외 `user`다. role에 `seller` 값은 없다. |
| 판매관리 진입 | `/sales-management`와 모든 하위 경로에 서명·만료를 검증한 NextAuth 토큰의 유효한 `id`가 필요하다. 없으면 원래 경로/query를 `callbackUrl`에 담아 `/login`으로 이동한다. 로그인 후 같은 사이트의 절대 경로로 복귀한다. |
| 판매자 판별 | upstream `lib/qrshop/store-api.ts`의 `requireStoreUser`는 로그인 사용자 누구나 허용한다. `lib/seller/store.ts`의 `getSellerContext`도 `session.user.id`만 요구한다. 팀 기반 `/api/user/profile.isSeller`를 QRshop 상점 권한으로 사용하지 않는다. |
| API 권한 | UI 진입 검사는 API 인가를 대신하지 않는다. upstream 상점 조회·변경·삭제는 세션 사용자와 `Store.userId` 소유권을 검증하며 비소유자에게도 존재 여부를 숨기는 404 `NOT_FOUND`를 반환한다. 이번 작업에서는 서버 API를 수정·이관하지 않았다. |

## upstream 준비 API와 식별자

- `GET /api/v2/qrshop/summary`: 본인 상점과 집계. 상점 미등록도 성공이며 `data.store: null`이다.
- `GET /api/v2/qrshop/stores/me`: 본인 상점. 미등록이면 성공의 `data: null`; 상점이 없다는 이유로 접근을 거절하지 않는다.
- 상점 기본 키는 `storeId`, URL 식별자는 `storeSlug`, 소유자는 `userId`다. summary 응답은 상점 기본 키를 `store.id`로 매핑한다. `storeSlug`를 DB 기본 키로 보내지 않는다.
- 상품 기본 키는 `OnsiteProduct.productId`, 옵션 기본 키는 `optionId`; 기존 shop의 Product/Team 및 Mock 식별자와 혼용하지 않는다.
- 공통 오류 envelope는 `{ status: 'error', code, message }`다. 상점 생성에는 409 `STORE_ALREADY_EXISTS` / `STORE_SLUG_TAKEN`, 변경·삭제에는 404 `NOT_FOUND` / 409 `STORE_HAS_SALES`가 있다. 별도의 판매자 role이나 403 권한 계약은 추측해 추가하지 않는다.

위 v2 API와 새 Store 스키마는 upstream에서 읽기 전용으로 확인한 계약이다. 기준 브랜치로 전체 main이나 상점·상품·주문 API를 가져오지 않았다. 실제 판매관리 Service 연결과 해당 오류 UI는 담당 API 연동 작업에서 진행한다.

## 확인 범위

테스트는 실제 인증 성공을 대신하지 않는다. 이 세션은 설정 값·DB 계정이 없어 실제 이메일/카카오 로그인, 쿠키 유지, 소유권 거절을 검증하지 않았다.
main은 개발 DB와 위 설정을 준비한 뒤 비로그인 직접 진입 → 로그인 → 원래 판매관리 경로 복귀, 새로고침 세션 유지, 상점 미등록 사용자의 접근을 브라우저에서 확인한다.

## v2 상점 API 선택 (세션04)

기본은 `NEXT_PUBLIC_SALES_MANAGEMENT_DATA_SOURCE="mock"`이다. 동일 origin에 upstream/main `c4ba954`의 상점·summary·QR API와 Store 스키마, 개발 DB, NextAuth 세션이 준비된 뒤 `api`로 설정하고 앱을 다시 실행/빌드해야 한다. 이 브랜치는 서버/스키마를 이관하지 않아 설정만 바꿔서는 실제 연동되지 않는다. URL query의 `state`는 API 모드를 바꾸지 않는다.

API 모드의 `/sales-management/v2`와 `/store`는 본인 상점 조회, 중복 확인, 등록·수정·삭제, 집계와 서버 SVG QR을 사용한다. `storeId`를 변경/삭제/QR 경로에, `storeSlug`를 중복 검사와 요청 본문에 사용한다. 이름은 서버와 같이 공백 제거 후 1~16자, 식별자는 영문 소문자/숫자 4자 이상이다. 변경 응답의 서버 URL을 사용하고 QR은 열 때마다 현재 상점으로 다시 요청한다. 401·404·409와 네트워크 실패를 오류로 유지하며 Mock 성공으로 대체하지 않는다. 판매 이력이 있으면 삭제 버튼이 숨겨지고, 조회 이후 판매가 생긴 경우에도 서버의 `STORE_HAS_SALES` 거절을 표시한다.

## v2 상품 API 연결 (세션05)

같은 `api` 설정으로 판매자 `GET/POST /api/v2/qrshop/products`, `PATCH/DELETE /api/v2/qrshop/products/{OnsiteProduct.productId}`, `GET/POST /api/v2/qrshop/categories`를 사용한다. 공개 방문객 카탈로그 `GET /api/v2/qrshop?storeSlug=...`와 구분한다. 서버/스키마는 이관하지 않았으며 동일 origin에 upstream `c4ba954` 계약이 준비되어야 한다.

기존 검색/필터/20개 페이지 UI를 유지하기 위해 판매자 목록을 `pageSize=100`으로 `hasNext=false`까지 읽는다. 최근 상품은 summary에 없는 값을 만들지 않고 목록을 `pageSize=6`으로 별도 조회한다. 상품 id·카테고리 id·옵션 id는 서버 값을 보존한다. 기본가는 `price`, 옵션 추가금은 `surcharge`, 재고는 `totalStock`/`options.stock`으로 매핑한다. 수정은 옵션 전체를 대체하며 옵션 해제는 `options: []`, 이미지/카테고리 해제는 `null`로 보낸다. 카테고리 이름을 생성/조회한 id로 변환한다. UI의 8자 카테고리 제한은 유지하며 서버 자체 최대값은 30자다.

상품 이미지는 `POST /api/v1/images`의 multipart `usage=ONSITE_PRODUCT`, `image=File`로 업로드하고 반환된 `imageUrl`만 상품에 저장한다. **API 모드는 JPEG/PNG/WebP, 10MB 이하, 비어 있지 않은 파일과 .jpg/.jpeg/.png/.webp 확장자**를 검사한다. Figma 및 기존 Mock의 JPEG/PNG 50MB와 다르므로 안내/accept도 모드에 맞춘다. Mock은 FileReader 미리보기만 사용한다. 업로드된 이미지 레코드를 삭제하는 계약은 없어 이미지 선택 취소/상품 이미지 해제 시 이미지 DB 자체를 지우지 않는다. 상점 이미지 업로드는 여전히 미지원이다.

`hasSalesHistory`로 삭제 버튼을 숨기고 이후 판매가 생긴 서버의 409 `PRODUCT_HAS_SALES`도 표시한다. 401/404/검증/업로드/네트워크 실패를 Mock 성공으로 대체하지 않는다. API 랜딩에서 상품 관리/등록/수정을 열지만, 현장 포스는 실제 주문 연동 전까지 링크와 직접 주소 진입 모두 막는다. Mock POS는 기존대로 동작한다.

검증은 fetch 계약과 UI 테스트이며 실서버 E2E는 미확인이다. API/DB 이관 후 main은 실제 로그인으로 상점 CRUD 및 식별자 변경 후 새 URL·SVG QR을 확인해야 한다. 운영 DB·migration·배포는 수행하지 않았다.
