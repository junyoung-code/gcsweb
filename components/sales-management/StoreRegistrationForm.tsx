'use client';

import { useState } from 'react';
import type { SalesManagementService } from '@/lib/services/sales-management-service';
import { salesManagementMockService } from '@/lib/mocks';
import { useStoreForm } from './useStoreForm';
import { cn } from '@/lib/utils';

interface StoreRegistrationFormProps {
  service?: SalesManagementService;
}

export default function StoreRegistrationForm({
  service = salesManagementMockService,
}: StoreRegistrationFormProps) {
  const { input, errors, identifierStatus, submitError, isSubmitting, registeredStore, setRegisteredStore, updateInput, checkIdentifier, submit } = useStoreForm(service);
  const [copied, setCopied] = useState(false);

  const copyVisitorUrl = async () => {
    if (!registeredStore) return;

    try {
      await navigator.clipboard?.writeText(registeredStore.visitorOrderUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (registeredStore) {
    return (
      <div className="space-y-6">
        <section className="rounded-xl bg-neutral-1 p-6 sm:p-[61px]">
          <div className="grid gap-7">
            <ReadOnlyField label="상점명" value={registeredStore.name} />
            <ReadOnlyField label="상점 아이디" value={registeredStore.storeIdentifier} />
          </div>
          <button
            type="button"
            onClick={() => setRegisteredStore(null)}
            className="mt-10 h-[50px] rounded bg-orange-5 px-4 typo-body-large-bold text-neutral-2 transition-colors hover:bg-orange-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-7"
          >
            상점 정보 수정하기
          </button>
          <p className="mt-3 typo-body-small text-neutral-12">
            상점 정보를 수정할 경우 상점 URL과 QR코드가 새로 발급됩니다.
          </p>
        </section>

        <section className="rounded-xl bg-neutral-1 p-6 sm:p-[61px]" aria-live="polite">
          <h2 className="typo-heading-medium">QR샵 URL</h2>
          <div className="mt-8 grid items-center gap-7 md:grid-cols-[170px_minmax(0,1fr)]">
            <div
              aria-label="방문객 주문 QR 코드 미리보기"
              className="grid h-[170px] w-[170px] grid-cols-7 grid-rows-7 gap-1 rounded-[14px] border border-neutral-6 bg-neutral-4 p-3"
            >
              {Array.from({ length: 49 }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    'rounded-[1px]',
                    (index * 7 + registeredStore.storeIdentifier.length * 3) % 5 < 2
                      ? 'bg-neutral-10'
                      : 'bg-neutral-2',
                  )}
                />
              ))}
            </div>
            <div>
              <label htmlFor="visitor-url" className="typo-heading-xsmall">
                방문객 주문 URL
              </label>
              <div className="mt-2 flex gap-3">
                <input
                  id="visitor-url"
                  value={registeredStore.visitorOrderUrl}
                  readOnly
                  className="h-[50px] min-w-0 flex-1 rounded-lg border border-neutral-6 bg-neutral-2 px-3 typo-body-medium text-neutral-12"
                />
                <button
                  type="button"
                  onClick={copyVisitorUrl}
                  className="h-[50px] shrink-0 rounded-lg border border-neutral-5 bg-neutral-2 px-4 typo-body-medium-bold text-neutral-10 hover:bg-neutral-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-5"
                >
                  {copied ? '복사됨' : '복사하기'}
                </button>
              </div>
              <p className="mt-2 typo-body-small text-neutral-10">
                해당 QR코드와 URL을 사용해 방문객들이 상점 사이트로 바로 진입할 수 있습니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <section className="rounded-xl bg-neutral-1 p-6 sm:p-[61px]">
        <div className="space-y-7">
          <FormField
            id="store-name"
            label="상점명"
            value={input.name}
            onChange={(value) => updateInput('name', value)}
            error={errors.name}
            placeholder="상점명을 입력해주세요"
          />
          <div>
            <label htmlFor="store-identifier" className="typo-heading-medium text-neutral-10">
              상점 아이디
            </label>
            <div className="mt-2 flex gap-3">
              <input
                id="store-identifier"
                value={input.storeIdentifier}
                onChange={(event) => updateInput('storeIdentifier', event.target.value)}
                aria-describedby="store-identifier-help"
                aria-invalid={Boolean(errors.storeIdentifier)}
                placeholder="예: paper-shop"
                className={cn(
                  'h-[50px] min-w-0 flex-1 rounded-lg border bg-neutral-2 px-3 typo-body-medium text-neutral-12 outline-none transition-colors placeholder:text-neutral-7 focus:border-orange-5 focus:ring-2 focus:ring-orange-2',
                  errors.storeIdentifier ? 'border-danger' : 'border-neutral-6',
                )}
              />
              <button
                type="button"
                onClick={checkIdentifier}
                disabled={identifierStatus === 'checking'}
                className="h-[50px] shrink-0 rounded-lg border border-neutral-5 bg-neutral-2 px-4 typo-body-medium-bold text-neutral-10 transition-colors hover:bg-neutral-3 disabled:cursor-wait disabled:text-neutral-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-5"
              >
                {identifierStatus === 'checking' ? '확인 중' : '중복 확인'}
              </button>
            </div>
            <p
              id="store-identifier-help"
              className={cn(
                'mt-2 typo-body-small',
                errors.storeIdentifier ? 'text-danger' : identifierStatus === 'available' ? 'text-positive' : 'text-neutral-8',
              )}
            >
              {errors.storeIdentifier ??
                (identifierStatus === 'available'
                  ? '사용 가능한 아이디입니다.'
                  : '영문 소문자, 숫자, 하이픈으로 3~20자 입력해주세요.')}
            </p>
          </div>
        </div>
        {submitError ? <p role="alert" className="mt-5 typo-body-small text-danger">{submitError}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-8 h-[50px] rounded bg-orange-5 px-4 typo-body-large-bold text-neutral-2 transition-colors hover:bg-orange-6 disabled:cursor-wait disabled:bg-orange-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-7"
        >
          {isSubmitting ? '상점 등록 중...' : '상점 등록하기'}
        </button>
      </section>

      <section className="rounded-xl bg-neutral-1 px-6 py-14 text-center sm:px-[61px]">
        <p className="typo-heading-medium text-neutral-7">
          상점 등록 시 방문객들이 사용할 상점 바로가기 URL과 QR코드가 발급됩니다
        </p>
      </section>
    </form>
  );
}

function FormField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="typo-heading-medium text-neutral-10">{label}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        placeholder={placeholder}
        className={cn(
          'mt-2 h-[50px] w-full rounded-lg border bg-neutral-2 px-3 typo-body-medium text-neutral-12 outline-none transition-colors placeholder:text-neutral-7 focus:border-orange-5 focus:ring-2 focus:ring-orange-2',
          error ? 'border-danger' : 'border-neutral-6',
        )}
      />
      {error ? <p className="mt-2 typo-body-small text-danger">{error}</p> : null}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="typo-heading-medium text-neutral-10">{label}</p>
      <p className="mt-2 flex h-[50px] items-center rounded-lg border border-neutral-6 bg-neutral-3 px-3 typo-body-medium text-neutral-7">
        {value}
      </p>
    </div>
  );
}
