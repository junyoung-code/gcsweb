import { afterEach, describe, expect, it, vi } from 'vitest';
import { getQrshopBuyer } from './buyer-profile';
afterEach(() => vi.unstubAllGlobals());
describe('QRshop 회원 구매자 정보', () => {
  it('기존 프로필 GET의 이름·이메일·휴대폰만 정규화한다', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ email: ' member@example.com ', name: ' 회원 ', phone: '010-0000-0000', nickname: '별명' }) });
    vi.stubGlobal('fetch', fetcher);
    expect(await getQrshopBuyer()).toEqual({ email: 'member@example.com', name: '회원', phone: '01000000000' });
    expect(fetcher).toHaveBeenCalledWith('/api/user/profile', { cache: 'no-store', signal: undefined });
  });
  it('세션 만료는 비회원 입력으로 전환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));
    expect(await getQrshopBuyer()).toEqual({ email: '', name: '', phone: '' });
  });
  it('누락·잘못된 정보는 입력 대상으로 남긴다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ email: 'invalid', phone: null, name: '   ' }) }));
    expect(await getQrshopBuyer()).toEqual({ email: '', name: '', phone: '' });
  });
  it('서버 오류는 비회원으로 오인하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 500, ok: false }));
    await expect(getQrshopBuyer()).rejects.toThrow('회원정보를 불러오지 못했습니다');
  });
});
