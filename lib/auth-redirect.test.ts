import { describe, expect, it } from 'vitest';
import { getLoginCallbackUrl } from './auth-redirect';

describe('로그인 복귀 경로', () => {
  it('내부 경로와 query를 보존한다', () => {
    expect(getLoginCallbackUrl('/sales-management/v2/products?state=empty')).toBe('/sales-management/v2/products?state=empty');
  });

  it.each([null, '', 'https://example.com', '//example.com', '/\\example.com', 'javascript:alert(1)', '/\n/example.com'])('안전하지 않은 경로 %s는 홈으로 대체한다', (value) => {
    expect(getLoginCallbackUrl(value)).toBe('/');
  });
});
