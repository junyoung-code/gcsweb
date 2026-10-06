# GCS 개발 가이드라인

이 문서는 GCS 프로젝트의 협업 개발을 위한 가이드라인입니다.

---

## 목차

1. [프로젝트 구조 개요](#프로젝트-구조-개요)
2. [폴더별 역할 및 수정 가이드](#폴더별-역할-및-수정-가이드)
3. [설정 파일 설명](#설정-파일-설명)
4. [개발 컨벤션](#개발-컨벤션)

---

## 프로젝트 구조 개요

```
GCS/
├── .next/              # 빌드 결과물 (자동 생성)
├── app/                # 페이지 및 API 라우트
├── components/         # 재사용 컴포넌트
├── hooks/              # 커스텀 React 훅
├── lib/                # 라이브러리 설정 및 유틸리티
├── node_modules/       # 패키지 (자동 생성)
├── prisma/             # 데이터베이스 스키마
├── public/             # 정적 파일
├── stores/             # Zustand 상태 저장소
├── types/              # TypeScript 타입 정의
└── [설정 파일들]
```

---

## 폴더별 역할 및 수정 가이드

### 📁 자동 생성 폴더 (수정 금지)

| 폴더 | 설명 | 수정 가능 |
|------|------|:---------:|
| `.next/` | Next.js 빌드 결과물. `npm run dev` 또는 `npm run build` 시 자동 생성 | ❌ |
| `node_modules/` | npm 패키지들이 설치되는 폴더. `npm install` 시 자동 생성 | ❌ |

---

### 📁 app/ - 페이지 및 API (핵심 개발 영역)

Next.js App Router 구조로, **프론트엔드 UI**와 **백엔드 API**가 함께 있습니다.

| 경로 | 역할 | 수정 가능 | 담당 |
|------|------|:---------:|------|
| `app/(auth)/` | 인증 관련 페이지 (로그인, 회원가입 등). 헤더/푸터 없음 | ✅ | 프론트엔드 |
| `app/(main)/` | 메인 서비스 페이지. 헤더/푸터 포함 | ✅ | 프론트엔드 |
| `app/api/` | 백엔드 API 엔드포인트 | ✅ | 백엔드 |
| `app/globals.css` | 전역 CSS 스타일 | ⚠️ 협의 후 | 공통 |
| `app/layout.tsx` | 루트 레이아웃 (HTML, Provider 설정) | ⚠️ 협의 후 | 공통 |
| `app/providers.tsx` | 전역 Provider (TanStack Query, NextAuth 등) | ⚠️ 협의 후 | 공통 |

#### 📌 새 페이지 추가 방법

```
# 일반 페이지 (헤더/푸터 포함)
app/(main)/[페이지명]/page.tsx

# 인증 페이지 (헤더/푸터 없음)
app/(auth)/[페이지명]/page.tsx

# API 엔드포인트
app/api/[리소스명]/route.ts
```

---

### 📁 components/ - UI 컴포넌트

재사용 가능한 React 컴포넌트를 모아둔 폴더입니다.

| 경로 | 역할 | 수정 가능 |
|------|------|:---------:|
| `components/layout/` | 레이아웃 컴포넌트 (Header, Footer 등) | ✅ |
| `components/ui/` | 범용 UI 컴포넌트 (Button, Input 등) | ✅ |

#### 📌 컴포넌트 추가 규칙

- **공통 UI**: `components/ui/` 에 추가
- **레이아웃**: `components/layout/` 에 추가
- **특정 기능용**: `components/[기능명]/` 폴더 생성 (예: `components/shop/`)

---

### 📁 lib/ - 라이브러리 및 유틸리티

핵심 설정 파일과 유틸리티 함수를 모아둔 폴더입니다.

| 파일 | 역할 | 수정 가능 |
|------|------|:---------:|
| `lib/auth.ts` | NextAuth.js 인증 설정 | ⚠️ 주의 |
| `lib/db.ts` | Prisma 클라이언트 인스턴스 | ❌ |
| `lib/email.ts` | Brevo 이메일 설정 및 템플릿 | ✅ |
| `lib/utils.ts` | 유틸리티 함수 (cn, formatDate 등) | ✅ |
| `lib/validations/` | Zod 검증 스키마 | ✅ |

---

### 📁 hooks/ - 커스텀 훅

React 커스텀 훅을 모아둔 폴더입니다.

| 파일 | 역할 | 수정 가능 |
|------|------|:---------:|
| `hooks/useUser.ts` | 사용자 정보 조회 훅 | ✅ |
| `hooks/index.ts` | 훅 내보내기 (export) | ✅ |

#### 📌 새 훅 추가 시

1. `hooks/use[훅이름].ts` 파일 생성
2. `hooks/index.ts`에 export 추가

---

### 📁 stores/ - Zustand 상태 저장소

클라이언트 전역 상태를 관리하는 Zustand 스토어입니다.

| 파일 | 역할 | 수정 가능 |
|------|------|:---------:|
| `stores/ui.ts` | UI 상태 (사이드메뉴 열림 등) | ✅ |
| `stores/index.ts` | 스토어 내보내기 | ✅ |

#### 📌 새 스토어 추가 시

1. `stores/[스토어명].ts` 파일 생성
2. `stores/index.ts`에 export 추가

---

### 📁 types/ - TypeScript 타입

TypeScript 타입 정의 파일을 모아둔 폴더입니다.

| 파일 | 역할 | 수정 가능 |
|------|------|:---------:|
| `types/index.ts` | 공통 타입 정의 | ✅ |
| `types/next-auth.d.ts` | NextAuth 세션 타입 확장 | ⚠️ 주의 |

---

### 📁 prisma/ - 데이터베이스

Prisma ORM 설정 및 스키마 파일입니다.

| 파일 | 역할 | 수정 가능 |
|------|------|:---------:|
| `prisma/schema.prisma` | DB 스키마 정의 | ⚠️ 협의 후 |

#### 📌 스키마 수정 후 필수 작업

```bash
npm run db:migrate    # 마이그레이션 생성·적용 + Prisma Client 재생성 (로컬/본인 전용 개발 DB 한정)
```

- ⚠️ `db:migrate`(`prisma migrate dev`)는 스키마가 어긋나면 **데이터 초기화(reset)를 요구할 수 있습니다.** 운영 DB·팀 공용 DB를 가리키고 있으면 실행하지 않습니다. 실행 전 `.env`의 `DATABASE_URL`이 어느 DB인지 확인하세요.
- 공용 DB에 이미 만들어진 마이그레이션만 적용해야 한다면 `npx prisma migrate deploy`를 사용합니다. 어떤 DB를 쓸지는 팀에 확인한 뒤 정합니다.
- 생성된 `prisma/migrations/` 폴더는 스키마 변경과 함께 커밋합니다.
- `.env`는 Git에 올라가지 않으므로 새 PC에서는 직접 만들어야 합니다. `DATABASE_URL`이 없으면 Prisma 명령이 `P1012` 오류로 실패합니다.
- 배포 시에는 `npm start`가 `prisma migrate deploy`를 자동 실행합니다.
- `npm run db:push`는 마이그레이션 기록을 남기지 않으므로 버려도 되는 로컬 DB에서만 사용합니다.

---

### 📁 public/ - 정적 파일

이미지, 폰트 등 정적 자산을 저장하는 폴더입니다.

| 경로 | 역할 | 수정 가능 |
|------|------|:---------:|
| `public/images/` | 이미지 파일 | ✅ |

---

## 설정 파일 설명

### 🔒 수정 금지 (자동 생성)

| 파일 | 설명 |
|------|------|
| `next-env.d.ts` | Next.js TypeScript 타입 선언 (자동 생성) |
| `package-lock.json` | 패키지 버전 잠금 (npm install 시 자동 생성) |

---

### ⚠️ 수정 시 주의 필요 (협의 후)

| 파일 | 설명 | 수정 시 주의사항 |
|------|------|------------------|
| `package.json` | 프로젝트 정보 및 의존성 | 패키지 추가/삭제 시 팀 공유 |
| `tsconfig.json` | TypeScript 설정 | path alias 추가 시 협의 |
| `tailwind.config.ts` | Tailwind CSS 설정 | 커스텀 색상/폰트 추가 시 협의 |
| `next.config.js` | Next.js 설정 | 빌드/배포 관련 설정 |
| `.eslintrc.json` | ESLint 규칙 | 린트 규칙 변경 시 협의 |
| `.gitignore` | Git 제외 파일 목록 | 필요 시 추가 가능 |
| `railway.json` | Railway 배포 설정 | 배포 담당자만 수정 |

---

### ✅ 자유롭게 수정 가능

| 파일 | 설명 |
|------|------|
| `README.md` | 프로젝트 문서 |
| `env.example` | 환경변수 예시 (새 변수 추가 시 업데이트) |

---

### 🚫 Git에 올리면 안 되는 파일

| 파일 | 설명 |
|------|------|
| `.env` | 환경변수 (API 키, DB 연결 정보 등 민감 정보) |

---

## 개발 컨벤션

### 파일/폴더 네이밍

| 대상 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 | PascalCase | `Button.tsx`, `UserCard.tsx` |
| 훅 | camelCase + use 접두사 | `useUser.ts`, `useProducts.ts` |
| 스토어 | camelCase | `ui.ts`, `cart.ts` |
| 유틸리티 | camelCase | `utils.ts`, `formatters.ts` |
| API 라우트 | kebab-case | `api/user-profile/route.ts` |

### import 경로

`@/` alias를 사용하여 절대 경로로 import합니다.

```typescript
// ✅ Good
import { Button } from '@/components/ui';
import { useUser } from '@/hooks';
import { prisma } from '@/lib/db';

// ❌ Bad
import { Button } from '../../../components/ui';
```

### 브랜치 전략

```
main (production)
  └── develop (개발 통합)
        ├── feature/[기능명]
        ├── fix/[버그명]
        └── refactor/[대상]
```

### 커밋 메시지 규칙

```
type: subject

type 종류:
- feat: 새 기능
- fix: 버그 수정
- docs: 문서 변경
- style: 코드 스타일 (포맷팅 등)
- refactor: 리팩토링
- test: 테스트 추가
- chore: 빌드/설정 변경
```

---

## 빠른 참조

### 자주 쓰는 명령어

```bash
npm run dev          # 개발 서버 실행
npm run build        # 프로덕션 빌드
npm run lint         # ESLint 검사
npm run db:generate  # Prisma Client 생성
npm run db:migrate   # 마이그레이션 생성·적용 (로컬/본인 전용 개발 DB 한정)
npx prisma migrate deploy   # 이미 만들어진 마이그레이션만 적용 (공용/운영 DB)
npm run db:studio    # Prisma Studio (DB GUI)
```

### 환경변수 설정

```bash
cp env.sample .env  # .env 파일 생성
# .env 파일 열어서 값 설정
```

---

## 문의

프로젝트 관련 질문은 팀 채널에서 공유해주세요.
