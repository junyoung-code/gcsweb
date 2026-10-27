import { NextResponse } from 'next/server';

/** `data`는 에러에 부가 정보가 필요할 때만 넘긴다(예: 품절 항목 목록). 넘기지 않으면 응답에 data 키가 없다. */
export function apiError(status: number, code: string, message: string, data?: unknown) {
  return NextResponse.json(
    { status: 'error', code, message, ...(data !== undefined ? { data } : {}) },
    { status },
  );
}

export function apiSuccess<T>(data: T, code?: string) {
  return NextResponse.json({ status: 'success', ...(code ? { code } : {}), data });
}

// 여러 라우트(팀 등록, 팀 수정 등)에서 코드뿐 아니라 메시지 문구까지 그대로 반복되는 실패 케이스용 프리셋.
// 문구가 그 엔드포인트에서만 다르면 인자로 덮어쓰고, 아니면 기본값을 그대로 씀.
export const apiErrors = {
  invalidInput: (message = '필수 입력값이 누락되었습니다.') => apiError(400, 'INVALID_INPUT', message),
  unauthorized: (message = '로그인이 필요한 서비스입니다.') => apiError(401, 'UNAUTHORIZED', message),
  forbidden: (message = '권한이 없습니다.') => apiError(403, 'FORBIDDEN', message),
  notFound: (message = '대상을 찾을 수 없습니다.') => apiError(404, 'NOT_FOUND', message),
  conflict: (message = '이미 처리된 요청입니다.') => apiError(409, 'CONFLICT', message),
  serverError: (message = '서버 오류 발생.') => apiError(500, 'SERVER_ERROR', message),
};
