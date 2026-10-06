import { Prisma } from '@prisma/client';
import type { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { apiError, apiErrors } from '@/lib/api-response';

type UserAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/** 상점 API 공통 인증: 로그인한 사용자 누구나(판매자 여부와 무관). */
export async function requireStoreUser(): Promise<UserAuthResult> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, response: apiErrors.unauthorized() };
  }
  return { ok: true, userId };
}

export const storeErrors = {
  notFound: () => apiErrors.notFound('상점을 찾을 수 없음'),
  alreadyExists: () => apiError(409, 'STORE_ALREADY_EXISTS', '이미 등록된 상점이 있음'),
  slugTaken: () => apiError(409, 'STORE_SLUG_TAKEN', '이미 사용 중인 상점 아이디'),
};

/** Prisma unique 위반(P2002)이 특정 필드에서 났는지 확인한다. */
export function isUniqueViolation(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  return typeof target === 'string' && target.includes(field);
}
