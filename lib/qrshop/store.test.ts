// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildStoreUrl,
  createStoreSchema,
  generateStoreQrSvg,
  getStoreOrigin,
  storeNameSchema,
  storeSlugSchema,
  toStoreDetail,
  toStoreSummary,
  updateStoreSchema,
} from './store';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('storeNameSchema', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(storeNameSchema.parse('  열반급행  ')).toBe('열반급행');
  });

  it('1~16자를 허용한다', () => {
    expect(storeNameSchema.safeParse('가').success).toBe(true);
    expect(storeNameSchema.safeParse('가'.repeat(16)).success).toBe(true);
  });

  it('빈 문자열·공백만·17자 이상을 거부한다', () => {
    expect(storeNameSchema.safeParse('').success).toBe(false);
    expect(storeNameSchema.safeParse('   ').success).toBe(false);
    expect(storeNameSchema.safeParse('가'.repeat(17)).success).toBe(false);
  });

  it('이모지는 한 글자로 센다', () => {
    expect(storeNameSchema.safeParse('😀'.repeat(16)).success).toBe(true);
    expect(storeNameSchema.safeParse('😀'.repeat(17)).success).toBe(false);
  });

  it('문자열이 아니면 거부하고 짧은 메시지를 준다', () => {
    const result = storeNameSchema.safeParse(123);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('유효하지 않은 상점명');
  });
});

describe('storeSlugSchema', () => {
  it.each(['abcd', '1234', 'ab12', 'nirvanaexpress', 'a'.repeat(100)])('허용: %s', (slug) => {
    expect(storeSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(['abc', 'ABCD', 'ab_cd', 'ab-cd', '@abcd', 'abcd!', 'ab cd', '열반급행열반', ''])(
    '거부: %s',
    (slug) => {
      const result = storeSlugSchema.safeParse(slug);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toBe('유효하지 않은 상점 아이디');
    },
  );

  it('예약어(pay, result, v1)도 URL이 @로 시작하므로 허용한다', () => {
    expect(storeSlugSchema.safeParse('pay1').success).toBe(true);
    expect(storeSlugSchema.safeParse('result').success).toBe(true);
  });
});

describe('createStoreSchema / updateStoreSchema', () => {
  it('등록은 name과 storeSlug가 모두 필요하다', () => {
    expect(createStoreSchema.safeParse({ name: '열반급행' }).success).toBe(false);
    expect(createStoreSchema.safeParse({ name: '열반급행', storeSlug: 'abcd' }).success).toBe(true);
    expect(createStoreSchema.safeParse(null).success).toBe(false);
  });

  it('수정은 둘 중 하나 이상이 필요하다', () => {
    expect(updateStoreSchema.safeParse({}).success).toBe(false);
    expect(updateStoreSchema.safeParse({ name: '새이름' }).success).toBe(true);
    expect(updateStoreSchema.safeParse({ storeSlug: 'newslug' }).success).toBe(true);
    expect(updateStoreSchema.safeParse({ storeSlug: 'bad' }).success).toBe(false);
  });
});

describe('storeUrl', () => {
  it('storeSlug 앞에 @를 붙여 조립한다', () => {
    expect(buildStoreUrl('itzang', 'https://example.com')).toBe('https://example.com/QRshop/@itzang');
  });

  it('NEXTAUTH_URL 끝의 슬래시를 정리한다', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://example.com//');
    expect(getStoreOrigin()).toBe('https://example.com');
    expect(buildStoreUrl('itzang')).toBe('https://example.com/QRshop/@itzang');
  });

  it('운영에서 NEXTAUTH_URL이 없으면 에러를 던진다', () => {
    vi.stubEnv('NEXTAUTH_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getStoreOrigin()).toThrow();
  });

  it('개발 환경에서는 localhost로 대체한다', () => {
    vi.stubEnv('NEXTAUTH_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(getStoreOrigin()).toBe('http://localhost:3000');
  });
});

describe('응답 변환', () => {
  it('summary에는 createdAt이 없고 detail에는 ISO 문자열로 있다', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://example.com');
    const store = { storeId: 's1', name: '열반급행', storeSlug: 'nirvanaexpress', createdAt: new Date('2026-10-02T00:00:00.000Z') };
    expect(toStoreSummary(store)).toEqual({
      storeId: 's1',
      name: '열반급행',
      storeSlug: 'nirvanaexpress',
      storeUrl: 'https://example.com/QRshop/@nirvanaexpress',
    });
    expect(toStoreDetail(store).createdAt).toBe('2026-10-02T00:00:00.000Z');
  });
});

describe('generateStoreQrSvg', () => {
  it('SVG 문자열을 만든다', async () => {
    const svg = await generateStoreQrSvg('https://example.com/QRshop/@itzang');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
