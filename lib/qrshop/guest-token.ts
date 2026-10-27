import crypto from 'crypto';

/**
 * QR샵 방문객 주문 토큰.
 *
 * 비로그인 방문객이 자기 주문임을 증명하는 값이다. 주문 생성 시 서버가 발급해 응답에 한 번만 내려주고,
 * DB(Order.buyerGuestTokenHash)에는 SHA-256 해시만 저장한다. 주문마다 새로 발급한다.
 */
export const GUEST_TOKEN_HEADER = 'x-guest-token';

const GUEST_TOKEN_MAX_LENGTH = 256;

export function generateGuestToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashGuestToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** 요청 헤더에서 토큰을 읽는다. 없거나 비정상적으로 길면 null. */
export function readGuestToken(headers: Pick<Headers, 'get'>): string | null {
  const token = headers.get(GUEST_TOKEN_HEADER)?.trim();
  if (!token || token.length > GUEST_TOKEN_MAX_LENGTH) return null;
  return token;
}

/** 요청 토큰이 주문에 저장된 해시와 맞는지. 토큰이 없거나 해시가 없으면 false. */
export function verifyGuestToken(token: string | null | undefined, storedHash: string | null | undefined): boolean {
  if (!token || !storedHash) return false;

  const actual = Buffer.from(hashGuestToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}
