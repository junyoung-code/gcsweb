import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifyPortoneWebhook, WEBHOOK_TOLERANCE_SECONDS } from './portone-webhook';

const RAW_SECRET = crypto.randomBytes(32);
const SECRET = `whsec_${RAW_SECRET.toString('base64')}`;
const NOW = new Date('2026-10-27T12:00:00Z');
const NOW_SEC = Math.floor(NOW.getTime() / 1000);
const BODY = '{"type":"Transaction.Paid","timestamp":"2026-10-27T12:00:00Z","data":{"paymentId":"ord1"}}';

const sign = (id: string, ts: number, body: string, key: Buffer = RAW_SECRET) =>
  crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');

const headers = (values: Record<string, string>) => new Headers(values);

const valid = (overrides: Record<string, string> = {}) =>
  headers({
    'webhook-id': 'msg_1',
    'webhook-timestamp': String(NOW_SEC),
    'webhook-signature': `v1,${sign('msg_1', NOW_SEC, BODY)}`,
    ...overrides,
  });

describe('verifyPortoneWebhook', () => {
  it('올바른 서명이면 통과', () => {
    expect(verifyPortoneWebhook({ secret: SECRET, headers: valid(), body: BODY, now: NOW })).toBe(true);
  });

  it('whsec_ 접두사 없는 시크릿도 base64 로 받는다', () => {
    const secret = RAW_SECRET.toString('base64');
    expect(verifyPortoneWebhook({ secret, headers: valid(), body: BODY, now: NOW })).toBe(true);
  });

  it('서명이 여러 개면 하나만 맞아도 통과 (시크릿 교체 대응)', () => {
    const other = sign('msg_1', NOW_SEC, BODY, crypto.randomBytes(32));
    const h = valid({ 'webhook-signature': `v1,${other} v1,${sign('msg_1', NOW_SEC, BODY)}` });
    expect(verifyPortoneWebhook({ secret: SECRET, headers: h, body: BODY, now: NOW })).toBe(true);
  });

  it('본문이 바뀌면 실패', () => {
    expect(verifyPortoneWebhook({ secret: SECRET, headers: valid(), body: `${BODY} `, now: NOW })).toBe(false);
  });

  it('다른 시크릿이면 실패', () => {
    const secret = `whsec_${crypto.randomBytes(32).toString('base64')}`;
    expect(verifyPortoneWebhook({ secret, headers: valid(), body: BODY, now: NOW })).toBe(false);
  });

  it('헤더가 하나라도 없으면 실패', () => {
    for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      const h = valid();
      h.delete(name);
      expect(verifyPortoneWebhook({ secret: SECRET, headers: h, body: BODY, now: NOW })).toBe(false);
    }
  });

  it('시크릿이 비어 있으면 실패', () => {
    expect(verifyPortoneWebhook({ secret: '', headers: valid(), body: BODY, now: NOW })).toBe(false);
  });

  it('시각이 ±5분을 넘으면 실패 (재전송 공격 방지), 경계값은 통과', () => {
    const at = (ts: number) =>
      verifyPortoneWebhook({
        secret: SECRET,
        headers: valid({ 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${sign('msg_1', ts, BODY)}` }),
        body: BODY,
        now: NOW,
      });
    expect(at(NOW_SEC - WEBHOOK_TOLERANCE_SECONDS)).toBe(true);
    expect(at(NOW_SEC - WEBHOOK_TOLERANCE_SECONDS - 1)).toBe(false);
    expect(at(NOW_SEC + WEBHOOK_TOLERANCE_SECONDS + 1)).toBe(false);
  });

  it('v1 이 아닌 서명·형식이 깨진 서명은 무시한다', () => {
    const sig = sign('msg_1', NOW_SEC, BODY);
    for (const value of [`v2,${sig}`, sig, 'v1,', 'v1,not-base64!!']) {
      expect(verifyPortoneWebhook({ secret: SECRET, headers: valid({ 'webhook-signature': value }), body: BODY, now: NOW })).toBe(false);
    }
  });
});
