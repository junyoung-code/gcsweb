import { describe, expect, it } from 'vitest';
import { generateGuestToken, GUEST_TOKEN_HEADER, hashGuestToken, readGuestToken, verifyGuestToken } from './guest-token';

describe('generateGuestToken', () => {
  it('매번 다른 URL-safe 토큰을 만든다', () => {
    const a = generateGuestToken();
    const b = generateGuestToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('verifyGuestToken', () => {
  it('저장된 해시와 맞는 토큰만 통과한다', () => {
    const token = generateGuestToken();
    const hash = hashGuestToken(token);
    expect(verifyGuestToken(token, hash)).toBe(true);
    expect(verifyGuestToken(generateGuestToken(), hash)).toBe(false);
  });

  it('토큰이나 해시가 없으면 false', () => {
    const hash = hashGuestToken('t');
    expect(verifyGuestToken(null, hash)).toBe(false);
    expect(verifyGuestToken('', hash)).toBe(false);
    expect(verifyGuestToken('t', null)).toBe(false);
    expect(verifyGuestToken('t', undefined)).toBe(false);
  });

  it('해시 형식이 이상해도 예외 없이 false', () => {
    expect(verifyGuestToken('t', 'not-hex')).toBe(false);
    expect(verifyGuestToken('t', 'abcd')).toBe(false);
  });
});

describe('readGuestToken', () => {
  it('헤더 값을 trim 해서 읽는다', () => {
    const headers = new Headers({ [GUEST_TOKEN_HEADER]: '  abc  ' });
    expect(readGuestToken(headers)).toBe('abc');
  });

  it('없거나 비어 있거나 너무 길면 null', () => {
    expect(readGuestToken(new Headers())).toBeNull();
    expect(readGuestToken(new Headers({ [GUEST_TOKEN_HEADER]: '   ' }))).toBeNull();
    expect(readGuestToken(new Headers({ [GUEST_TOKEN_HEADER]: 'a'.repeat(257) }))).toBeNull();
  });
});
