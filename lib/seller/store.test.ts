import { describe, expect, it } from 'vitest';
import { buildVisitorOrderUrl, todayRangeInKst } from './store';

describe('todayRangeInKst', () => {
  it('KST 자정을 경계로 24시간 구간을 만든다', () => {
    // 2026-09-22 12:00 KST = 2026-09-22 03:00 UTC
    const { start, end } = todayRangeInKst(new Date('2026-09-22T03:00:00.000Z'));

    expect(start.toISOString()).toBe('2026-09-21T15:00:00.000Z'); // 09-22 00:00 KST
    expect(end.toISOString()).toBe('2026-09-22T15:00:00.000Z'); // 09-23 00:00 KST
  });

  it('UTC로는 전날이지만 KST로는 이미 오늘인 시각을 오늘로 센다', () => {
    // 2026-09-22 00:30 KST = 2026-09-21 15:30 UTC
    const now = new Date('2026-09-21T15:30:00.000Z');
    const { start, end } = todayRangeInKst(now);

    expect(start.toISOString()).toBe('2026-09-21T15:00:00.000Z');
    expect(now >= start && now < end).toBe(true);
  });

  it('KST 하루의 마지막 순간도 같은 구간에 든다', () => {
    // 2026-09-22 23:59:59 KST = 2026-09-22 14:59:59 UTC
    const now = new Date('2026-09-22T14:59:59.000Z');
    const { start, end } = todayRangeInKst(now);

    expect(now >= start && now < end).toBe(true);
    expect(end.toISOString()).toBe('2026-09-22T15:00:00.000Z');
  });
});

describe('buildVisitorOrderUrl', () => {
  it('상점 슬러그를 쿼리로 붙인다', () => {
    expect(buildVisitorOrderUrl('itjang-shop')).toBe('/QRshop?store=itjang-shop');
  });

  it('슬러그를 URL 인코딩한다', () => {
    expect(buildVisitorOrderUrl('잇장 샵')).toBe('/QRshop?store=%EC%9E%87%EC%9E%A5%20%EC%83%B5');
  });
});
