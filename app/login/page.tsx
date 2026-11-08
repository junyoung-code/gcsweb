'use client';

import Image from 'next/image';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckboxButton, LoginSupportLinks, LogoSubtext, TextField } from '@/components/ui';
import { type LoginInput } from '@/lib/validations/auth';
import { cn } from '@/lib/utils';
import { getLoginCallbackUrl } from '@/lib/auth-redirect';

type LoginUiState = 'default' | 'warning' | 'blocked';

type LoginErrorResponse = {
  code?: string;
  meta?: {
    failedAttempts?: number;
    maxAttempts?: number;
    lockedUntil?: string | null;
  };
};

const MAX_FAILED_ATTEMPTS = 5;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getLoginCallbackUrl(searchParams.get('callbackUrl'));
  const resetSuccess = searchParams.get('reset') === 'success';
  const isFromRestock = searchParams.get('from') === 'restock';

  const [loginUiState, setLoginUiState] = useState<LoginUiState>('default');
  const [rememberEmail, setRememberEmail] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(MAX_FAILED_ATTEMPTS);
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'AccessDenied') {
      setErrorMessage('이미 사용 중인 이메일입니다.');
    } else if (error) {
      setErrorMessage('로그인 중 오류가 발생했습니다. 다시 시도해 주세요.');
    }
  }, [searchParams]);

  const { register, handleSubmit, watch, reset, formState: { isSubmitting } } = useForm<LoginInput>({
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const emailValue = watch('email');
  const passwordValue = watch('password');
  const isWarningState = loginUiState === 'warning';
  const isBlockedState = loginUiState === 'blocked';

  useEffect(() => {
    if (!isBlockedState || !lockedUntilMs) return;

    const tick = () => {
      if (Date.now() >= lockedUntilMs) {
        setLoginUiState('default');
        setFailedAttempts(0);
        setLockedUntilMs(null);
        setFocusedField(null);
        setRememberEmail(false);
        reset({
          email: '',
          password: '',
        });
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [isBlockedState, lockedUntilMs, reset]);

  const safeMaxAttempts = maxAttempts > 0 ? maxAttempts : MAX_FAILED_ATTEMPTS;
  const safeFailedAttempts = Math.min(Math.max(failedAttempts, 1), safeMaxAttempts);
  const warningCaption = `아이디 또는 비밀번호가 일치하지 않습니다. (${safeFailedAttempts}/${safeMaxAttempts})`;

  const blockedCaption = '5분 뒤 다시 시도해주세요.';

  const onSubmit = async (data: LoginInput) => {
    if (isBlockedState) return;

    setLoginUiState('default');

    setErrorMessage(null);

    try {
      const loginResponse = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const loginResult = (await loginResponse.json().catch(() => null)) as LoginErrorResponse | null;

      if (!loginResponse.ok) {
        const code = loginResult?.code;
        const nextFailedAttempts = loginResult?.meta?.failedAttempts;
        const nextMaxAttempts = loginResult?.meta?.maxAttempts;
        const lockedUntil = loginResult?.meta?.lockedUntil ? new Date(loginResult.meta.lockedUntil).getTime() : null;

        if (typeof nextFailedAttempts === 'number') setFailedAttempts(nextFailedAttempts);
        if (typeof nextMaxAttempts === 'number' && nextMaxAttempts > 0) setMaxAttempts(nextMaxAttempts);
        if (lockedUntil && Number.isFinite(lockedUntil)) setLockedUntilMs(lockedUntil);

        if (code === 'ACCOUNT_LOCKED') {
          setLoginUiState('blocked');
          setRememberEmail(true);
        } else if (code === 'AUTH_FAILED') {
          setLoginUiState('warning');
          setRememberEmail(true);
        } else {
          setErrorMessage('로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        }
        return;
      }

      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        callbackUrl,
        redirect: false,
      });

      if (!result?.ok || result.error) {
        if (result?.error === 'CredentialsSignin') {
          setLoginUiState('warning');
          setRememberEmail(true);
        } else {
          setErrorMessage('로그인 세션을 만들지 못했습니다. 다시 시도해 주세요.');
        }
        return;
      }

      setFailedAttempts(0);
      setLockedUntilMs(null);
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setErrorMessage('로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const resetWarningState = () => {
    if (loginUiState === 'warning') {
      setLoginUiState('default');
    }
  };

  const getFieldState = (field: 'email' | 'password', hasValue: boolean) => {
    if (isWarningState) return 'warning' as const;
    if (isBlockedState) return 'blocked' as const;
    if (focusedField === field) return 'focus' as const;
    if (hasValue) return 'filled' as const;
    return 'default' as const;
  };

  return (
    <div className="w-full max-w-[375px]">
      <div className="border-b border-neutral-4 px-4 pb-[10px] pt-[10px]">
        <button
          type="button"
          onClick={() => {
            if (isFromRestock) {
              router.push('/');
              return;
            }
            router.back();
          }}
          className="inline-flex h-6 w-3 items-center justify-center"
          aria-label="뒤로가기"
        >
          <Image src="/assets/icons/icon-back.svg" alt="" width={12} height={24} />
        </button>
      </div>

      <div className="flex items-center justify-center pb-7 pt-7">
        <LogoSubtext />
      </div>

      <div className="rounded-t-[12px] bg-white px-4 pb-7 pt-[38px]">
        <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-[570px] flex-col justify-between">
          <div className="space-y-6">
            <div className="space-y-5">
              <h1 className={cn('text-center text-neutral-10 typo-heading-small')}>로그인</h1>
              {resetSuccess ? (
                <p className="text-center typo-body-xsmall text-orange-5">
                  비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.
                </p>
              ) : null}
              {errorMessage ? (
                <p className="text-center typo-body-xsmall text-danger">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="button"
                onClick={async () => {
                  setErrorMessage(null);
                  try {
                    const res = await signIn('kakao', { callbackUrl, redirect: false });
                    if (res?.error) {
                      setErrorMessage('카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
                    } else if (res?.url) {
                      window.location.href = res.url;
                    }
                  } catch {
                    setErrorMessage('카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
                  }
                }}
                className={cn(
                  'flex h-[45px] w-full items-center justify-center gap-2 rounded-lg bg-[#fee500] text-[#191600]',
                  'typo-body-small-bold'
                )}
              >
                <Image src="/assets/icons/icon-kakao-symbol.svg" alt="" width={18} height={17} />
                카카오 로그인
              </button>
            </div>

            <div className="border-t border-neutral-4" />

            <div className="space-y-4">
              <TextField
                id="email"
                type="email"
                label="아이디(이메일)"
                placeholder="example@gmail.com"
                state={getFieldState('email', emailValue.trim().length > 0)}
                inputProps={{
                  ...register('email', {
                    onBlur: () => setFocusedField(null),
                    onChange: () => resetWarningState(),
                  }),
                  onFocus: () => setFocusedField('email'),
                  disabled: isBlockedState,
                }}
                caption={isWarningState ? warningCaption : isBlockedState ? blockedCaption : undefined}
                captionClassName={cn('typo-body-xsmall', isBlockedState ? 'text-orange-5' : 'text-danger')}
              />

              <TextField
                id="password"
                type="password"
                label="비밀번호"
                placeholder="비밀번호를 입력해주세요."
                state={getFieldState('password', passwordValue.trim().length > 0)}
                inputProps={{
                  ...register('password', {
                    onBlur: () => setFocusedField(null),
                    onChange: () => resetWarningState(),
                  }),
                  onFocus: () => setFocusedField('password'),
                  disabled: isBlockedState,
                }}
                caption={isWarningState ? warningCaption : isBlockedState ? blockedCaption : undefined}
                captionClassName={cn('typo-body-xsmall', isBlockedState ? 'text-orange-5' : 'text-danger')}
              />
            </div>

            <CheckboxButton checked={rememberEmail} onChange={setRememberEmail} label="아이디 기억하기" />
          </div>

          <div className="flex flex-col items-center gap-2 pt-8">
            <div className="flex w-full flex-col items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting || isBlockedState}
                className={[
                  cn('h-[55px] w-full rounded-lg text-neutral-2 transition-colors typo-body-small-bold'),
                  !isBlockedState ? 'bg-orange-5' : 'bg-orange-3',
                ].join(' ')}
              >
                {isSubmitting ? '로그인 중...' : '이메일로 로그인'}
              </button>

              <div className={cn('flex items-center justify-center gap-2 typo-body-xsmall')}>
                <p className="text-neutral-8">아직 계정이 없으신가요?</p>
                <Link href="/register" className={cn('typo-body-xsmall-bold', 'text-orange-4')}>
                  회원가입
                </Link>
              </div>
            </div>

            <LoginSupportLinks />
          </div>
        </form>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="flex min-h-[400px] w-full max-w-[375px] items-center justify-center typo-body-small text-neutral-6">
      로딩 중...
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
