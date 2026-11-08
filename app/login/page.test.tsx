import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn } from 'next-auth/react';
import LoginPage from './page';

const navigation = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), back: vi.fn(), search: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => navigation.search,
}));
vi.mock('next-auth/react', () => ({ signIn: vi.fn() }));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}));

const genericError = '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

async function submitLogin() {
  fireEvent.change(screen.getByLabelText('아이디(이메일)'), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password123!' } });
  fireEvent.click(screen.getByRole('button', { name: '이메일로 로그인' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '이메일로 로그인' })).toBeEnabled());
}

describe('로그인과 판매관리 복귀', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.search = new URLSearchParams('callbackUrl=%2Fsales-management%2Fv2%3Fstate%3Dempty');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'success' }) }));
    vi.mocked(signIn).mockResolvedValue({ ok: true, status: 200, error: null, url: '/' });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('NextAuth 세션 생성 후 판매관리의 원래 경로로 복귀한다', async () => {
    render(<LoginPage />);
    await submitLogin();
    expect(signIn).toHaveBeenCalledWith('credentials', expect.objectContaining({ callbackUrl: '/sales-management/v2?state=empty', redirect: false }));
    expect(navigation.push).toHaveBeenCalledWith('/sales-management/v2?state=empty');
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('외부 복귀 URL은 홈으로 대체한다', async () => {
    navigation.search = new URLSearchParams('callbackUrl=https%3A%2F%2Fexample.com');
    render(<LoginPage />);
    await submitLogin();
    expect(navigation.push).toHaveBeenCalledWith('/');
  });

  it('인증 실패 횟수를 표시하고 세션 생성을 시도하지 않는다', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ code: 'AUTH_FAILED', meta: { failedAttempts: 2, maxAttempts: 5 } }) } as Response);
    render(<LoginPage />);
    await submitLogin();
    expect(screen.getAllByText('아이디 또는 비밀번호가 일치하지 않습니다. (2/5)')).toHaveLength(2);
    expect(signIn).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('계정 잠금은 재시도를 막는다', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ code: 'ACCOUNT_LOCKED', meta: { lockedUntil: new Date(Date.now() + 300000).toISOString() } }) } as Response);
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: '이메일로 로그인' }));
    expect(await screen.findAllByText('5분 뒤 다시 시도해주세요.')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '이메일로 로그인' })).toBeDisabled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('서버 오류를 비밀번호 불일치로 표시하지 않는다', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ code: 'SERVER_ERROR' }) } as Response);
    render(<LoginPage />);
    await submitLogin();
    expect(screen.getByText(genericError)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('네트워크 실패 후 오류를 표시하고 다시 시도할 수 있다', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    render(<LoginPage />);
    await submitLogin();
    expect(screen.getByText(genericError)).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('세션 생성 결과가 없으면 로그인 성공으로 이동하지 않는다', async () => {
    vi.mocked(signIn).mockResolvedValue(undefined);
    render(<LoginPage />);
    await submitLogin();
    expect(screen.getByText('로그인 세션을 만들지 못했습니다. 다시 시도해 주세요.')).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('NextAuth 호출 실패를 처리한다', async () => {
    vi.mocked(signIn).mockRejectedValue(new Error('session failed'));
    render(<LoginPage />);
    await submitLogin();
    expect(screen.getByText(genericError)).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('카카오 로그인에도 복귀 경로를 전달하고 시작 실패를 표시한다', async () => {
    vi.mocked(signIn).mockRejectedValue(new Error('oauth failed'));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: '카카오 로그인' }));
    expect(await screen.findByText('카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith('kakao', { callbackUrl: '/sales-management/v2?state=empty', redirect: false });
  });
});
