# 개발용 README (AI 협업 컨텍스트)

이 문서는 **Cursor 같은 AI 코딩 도구**가 이 저장소를 열었을 때, 빠르게 전체 맥락을 파악하고 안전하게 개발을 진행할 수 있도록 만든 “프로젝트 컨텍스트” 문서입니다.

---

## 1) 서비스(프로젝트) 내용과 목적

### 서비스 개요
- **GCS**는 Next.js 기반의 풀스택 웹 서비스입니다.
- 핵심 도메인은 “사용자/팀/상품/주문/정산/아카이브”로 구성됩니다.

### 목적(무엇을 만들고 있나)
- **사용자 인증/회원**: 이메일 기반 가입/로그인, 권한(일반/전공/관리자) 관리
- **팀(판매팀) 기반 운영**: 팀별 상품 운영 및 정산(Settlement)
- **상품/주문**: 상품(Product) 등록/조회, 주문(Order/OrderItem) 처리
- **아카이브**: Project 콘텐츠 노출

> 주의: UI/화면은 초기화 후 재구성 단계이며, 지금은 “백엔드 API + 기반 구조”를 먼저 안정화하는 흐름입니다.

---

## 2) 기술 스택 / 방법론

### 프레임워크/라이브러리
- **Next.js 14 (App Router)**: `app/` 기반 라우팅 + API Routes
- **TypeScript**: 엄격 모드(`strict: true`)
- **Prisma + PostgreSQL**: DB 스키마/쿼리
- **NextAuth.js**: 인증(세션/JWT 전략)
- **Brevo**: 이메일 발송(템플릿은 `lib/email.ts`)
- **TanStack Query**: 서버 상태/캐싱(클라이언트)
- **Zustand**: 클라이언트 전역 UI 상태(예: 사이드 메뉴)
- **React Hook Form + Zod**: 폼 + 스키마 검증
- **Tailwind CSS**: 스타일링

### 개발 방식(규칙)
- **API는 `app/api/**/route.ts`에 구현** (App Router 방식)
- **입력 검증은 Zod** (`lib/validations/*`)를 우선 사용
- **DB 변경은 Prisma 스키마 중심** (`prisma/schema.prisma`)

---

## 3) 디렉토리 구성(프론트 UI vs 백엔드 API 분리 의도)

> 이 프로젝트는 “한 repo”지만, 작성/소유 관점에서 UI와 API를 명확히 분리합니다.

### 핵심 경로
- **프론트(UI)**
  - `app/(main)/**`: 헤더/푸터 포함 페이지
  - `app/(auth)/**`: 인증 관련 페이지(헤더/푸터 없음)
  - `components/**`: UI/레이아웃 컴포넌트
  - `hooks/**`, `stores/**`: TanStack Query / Zustand 사용 코드
- **백엔드(API)**
  - `app/api/**`: 백엔드 엔드포인트
  - `lib/db.ts`: Prisma Client
  - `lib/auth.ts`: NextAuth 설정
  - `lib/email.ts`: Brevo 이메일 발송/템플릿
  - `prisma/schema.prisma`: DB 스키마

### 참고 문서
- 협업 규칙/파일 의미는 `docs/DEVELOPMENT_GUIDE.md`에 상세 정리되어 있습니다.

---

## 4) 실행 방법(로컬/배포 공통)

### 환경변수
`env.example` 참고해서 `.env`를 구성합니다(민감정보라 Git에 올리지 않음).

필수 키(현재 기준):
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `BREVO_API_KEY`
- `BREVO_FROM_EMAIL`

### 명령어

```bash
npm install
npm run db:generate
npm run db:push
npm run dev
```

### 빌드/배포
- `npm run build`는 **`prisma generate && next build`** 를 수행합니다.
- Railway 배포 설정은 `railway.json` 참고.

---

## 5) 데이터베이스(Prisma) 구조 요약

DB는 `prisma/schema.prisma`를 “진실의 원천(source of truth)”으로 사용합니다.

### 주요 모델(요약)
- **User**: `email`, `password`, `nickname`, `phone`, `memberType(0/1/2)` 등  
  - 로그인 실패 잠금: `failedLoginAttempts`, `lockedUntil`
- **Team**: 판매팀(대표/팀원/정산 계정 URL 등)
- **Product**: 상품(유형/상태/가격/펀딩 관련 필드)
- **Order / OrderItem**: 주문/주문항목
- **Settlement**: 정산
- **Project**: 아카이브 컨텐츠
- **Like**: 좋아요(여러 타입에 대한 선택적 FK)
- **VerificationToken**: 토큰 저장(현재는 refresh token 저장소로도 사용)

> DB 변경 시: 스키마 수정 → `npm run db:generate` → `npm run db:push` 순서로 반영합니다.  
> 운영 환경에서는 `migrate deploy` 전략을 검토할 수 있으나, 현재는 개발 초기 단계라 `db push`를 사용 중입니다.

---

## 6) 인증(NextAuth) 및 로그인 API 설계

### 기본 인증 흐름(현재)
- UI 로그인 페이지: `app/(auth)/login/page.tsx`
- NextAuth 엔드포인트: `app/api/auth/[...nextauth]/route.ts`
- Credential 인증 로직: `lib/auth.ts`의 `CredentialsProvider.authorize()`

### “API 명세 기반” 로그인 엔드포인트(추가 구현)
- `POST /api/v1/auth/login`
  - 구현: `app/api/v1/auth/login/route.ts`
  - 응답 포맷: `{ status, data: { accessToken, refreshToken, user } }`
  - 실패 포맷: `{ status: "error", code, message }`
  - 계정 잠김: 비밀번호 5회 실패 시 `ACCOUNT_LOCKED` 반환(잠금 시간 30분)
  - accessToken: NextAuth JWT 인코딩(유효 1시간)
  - refreshToken: 랜덤 토큰(유효 2주) → `VerificationToken`에 `identifier="refresh:{userId}"`로 저장

> 주의: NextAuth 기반으로 “세션 중심”을 유지하면서도, 외부/모바일/명세 호환을 위해 `/api/v1/auth/login` 같은 토큰 응답 API를 병행하는 구조입니다.

---

## 7) API 작성 가이드(백엔드)

### 라우트 파일 규칙
- 위치: `app/api/<...>/route.ts`
- 함수: `export async function GET/POST/PATCH/DELETE(...)`
- 입력값은 **Zod로 검증**하고, 실패 시 상태 코드/에러 코드를 통일합니다.

### 권한/인증 체크(권장)
- NextAuth 사용 시 서버에서 세션 검증은 `getServerSession(authOptions)` 패턴을 권장합니다.
- 관리자 권한은 `memberType === 2`를 기준으로 판단합니다(현재 role 매핑 규칙).

---

## 8) 프론트 상태 관리/폼 규칙

### TanStack Query
- 서버 상태(목록/상세/검색/페이지네이션)는 Query로 관리합니다.
- Provider는 `app/providers.tsx`에서 구성됩니다.

### Zustand
- “UI 전역 상태”(모달/사이드메뉴/토스트 등)에만 제한적으로 사용합니다.
- 예시: `stores/ui.ts`

### React Hook Form + Zod
- 폼 검증은 `lib/validations/*`의 Zod 스키마를 재사용합니다.

---

## 9) 깃 컨벤션(협업 규칙)

### 커밋 메시지 규칙(필수)
- 단일 라인: `type: subject`
- `type`는 아래 중 하나:
- `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- 예: `feat: Add v1 auth login endpoint`

### staging 규칙(팀 규칙)
- 변경사항 반영 시 기본적으로 **`git add .`** 사용

### PowerShell 주의
- PowerShell에서는 `&&` 체인이 제한될 수 있으므로, 여러 명령은 줄로 나눠 실행하는 것을 권장합니다.

---

## 10) 자주 발생하는 이슈 / 체크리스트

### Railway 빌드 실패 시
- 타입체크 실패가 자주 원인입니다(스키마 변경 후 API/폼 입력 누락 등).
- 로컬에서 `npm run build`를 먼저 통과시키는 것을 1순위로 합니다.

### Prisma 스키마 변경 후
- `npm run db:generate` 누락 시 런타임/타입 오류가 날 수 있습니다.

---

## 11) AI에게 부탁할 때(권장 프롬프트)

### 예시
- “`/api/v1/orders` 명세대로 구현해줘. 요청/응답/에러코드는 이 표 그대로.”
- “이 API는 admin만 접근 가능하게 하고, 세션 인증은 NextAuth로 처리해줘.”
- “DB는 Prisma 모델 기준으로만 접근해줘(직접 SQL 작성 금지).”

### AI가 알아야 하는 전제(요약)
- Next.js App Router 구조
- Prisma가 DB의 단일 진실
- 인증은 NextAuth(세션) + 일부 API 명세는 토큰 응답 엔드포인트 병행
- 에러 포맷/코드 통일 필요