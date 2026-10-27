import crypto from 'crypto';

/**
 * PortOne V2 웹훅(버전 2024-04-25) 서명 검증. Standard Webhooks 규격을 따른다.
 * - 헤더: webhook-id, webhook-timestamp(초 단위 Unix 시각), webhook-signature(`v1,<base64>`가 공백으로 여러 개)
 * - 서명: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${원문 body}`))
 * - 시크릿: `whsec_` 접두사 뒤의 base64 를 디코드한 값(접두사가 없으면 전체를 base64 로 본다)
 * - 원문 body(JSON 파싱 전 문자열)로 검증해야 한다.
 * 참고: https://developers.portone.io/opi/ko/integration/webhook/readme-v2
 */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type WebhookHeaders = Pick<Headers, 'get'>;

function decodeSecret(secret: string): Buffer {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  return Buffer.from(raw, 'base64');
}

export function verifyPortoneWebhook(params: {
  secret: string;
  headers: WebhookHeaders;
  body: string;
  now?: Date;
}): boolean {
  const { secret, headers, body, now = new Date() } = params;
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt)) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - sentAt) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = crypto.createHmac('sha256', decodeSecret(secret)).update(`${id}.${timestamp}.${body}`).digest();

  return signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',', 2);
    if (version !== 'v1' || !signature) return false;
    const actual = Buffer.from(signature, 'base64');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });
}
