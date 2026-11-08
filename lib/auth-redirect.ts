/** 로그인 복귀는 같은 사이트의 절대 경로만 허용한다. */
export function getLoginCallbackUrl(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\s\u0000-\u001f\u007f]/.test(value)) {
    return '/';
  }
  return value;
}
