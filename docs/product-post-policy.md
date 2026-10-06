# 상품글 정책

> 2026-09-09 백엔드 회의 결정 반영.
> 이전 판은 `ProductUpdateRequest` 기반 승인 플로우를 기술하고 있었으나,
> 해당 테이블들은 `20260817000000_remove_product_requests_and_rename_project_year`
> 마이그레이션에서 삭제되었다.

## A. 테이블 역할 정의

### Product (단일 운영본)

승인 대기용 요청본 테이블은 없다. 판매자가 등록하면 곧바로 운영본이 된다.

- `Product`: 상품정보
- `ProductImage`: 이미지
- `ProductOption` / `ProductOptionValue`: 옵션
- `ProductVariant`: 옵션 조합

## B. 상품 유형 (`Product.type`)

Prisma enum이 아니라 `Int`이며, 값의 의미는 `lib/product-type.ts`에서 정의한다.

| 값 | 유형 | 신규 등록·수정 |
|---|---|---|
| 0 | Fund | **불가** |
| 1 | Buy Now | 가능 |
| 2 | Partner Up | **불가** |

Fund와 Partner Up은 3차개발 「gcsweb에서 없어질 것」 리스트에 따라 비활성화되었다.
등록·수정 API는 이 두 값을 `INVALID_INPUT`(400)으로 거부한다.
**이미 등록된 Fund/Partner Up 상품의 조회 경로는 막지 않는다.** 다만 수정도 함께
막히므로, 기존 값 유지가 필요해지면 `ALL_PRODUCT_TYPES`를 쓰면 된다.

## C. 노출 기준

| 화면 | 조건 |
|---|---|
| 내가등록한상품 | `isAdminApproved = true` |
| 상품글관리(관리자) | `isAdminApproved = true` |
| Shop | `isAdminApproved = true` AND `isPublic = true` |
| Home | `isAdminApproved = true` AND `isPublic = true` AND `isHome = true` |

`isAdminApproved`는 조회 게이트로만 남아 있고, 승인 대기 상태를 만들지는 않는다.
아래 D 참고.

## D. 등록 / 수정 플로우

### 판매자 등록 (`POST /api/v1/mypage/products`)

`isAdminApproved = true`, `isPublic = true`, `isHome = false`로 즉시 생성된다.
별도 승인 절차 없이 바로 Shop에 노출된다.

3차개발 「없어질 것」 리스트의 *"상품글 관리자 승인 방식 (→ 판매팀이 올리면 그대로
shop에 노출되는 구조로)"* 에 해당한다. 즉 **승인 흐름이 동작하지 않는 것은 의도된
상태**이며, 되살리는 것이 아니라 걷어내는 방향이다.

`isAdminApproved` 컬럼 자체는 아직 남아 있다.

### 판매자 수정 (`PUT /api/v1/mypage/products/{productId}`)

`Product`를 직접 수정한다. 요청본을 거치지 않는다.

### 관리자

| 라우트 | 역할 |
|---|---|
| `GET /api/v1/admin/product/list` | 상품 목록 |
| `PATCH /api/v1/admin/product/{id}` | `isPublic` / `isHome` 토글 (노출 제어) |
| `GET`·`PATCH /api/v1/admin/product/update/{id}` | 관리자 직접 수정 |

`isPublic`을 `true`로 바꿀 때 `publicAt`이 기록되고, `false`로 되돌리면 `null`이 된다.

**등록요청 / 수정요청 목록 화면은 없다.** 관리자 상품 목록 헤더에 있던
`등록 N | 수정 N` 박스는 제거되었다. 가리키던 페이지가 이미 존재하지 않았고,
`수정` 카운트는 상수 `0`이었다.

## E. 검증 규칙

- 상품명: 13자 이내 (`PRODUCT_NAME_MAX_LENGTH`)
- Buy Now는 현장 수령(`receiveMethod = 1`)만 가능
- 등록·수정 시 `type`은 `lib/product-type.ts`의 `isSelectableProductType`을 통과해야 함
  - 프론트(zod)와 API 라우트가 같은 함수를 쓴다. 허용 목록을 바꿀 때 이 파일만 고치면 된다.
