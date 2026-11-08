import { useRef, useState } from 'react';
import type { SalesManagementService } from '@/lib/services/sales-management-service';
import { StoreApiError } from '@/lib/services/sales-management-store-api-service';
import type { SalesStore, StoreFormInput } from '@/types/sales-management';

type IdentifierStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'error';

const initialInput: StoreFormInput = { name: '', storeIdentifier: '' };

function validateStoreInput(input: StoreFormInput, v2: boolean, api: boolean) {
  const errors: Partial<Record<keyof StoreFormInput, string>> = {};

  const nameLength = [...input.name.trim()].length;
  if (api ? nameLength < 1 || nameLength > 16 : nameLength < 2) {
    errors.name = api ? '상점명은 1~16자 입력해주세요.' : '상점명은 2자 이상 입력해주세요.';
  }

  if (!(api ? /^[a-z0-9]{4,}$/ : v2 ? /^[a-z0-9]{4,20}$/ : /^[a-z0-9-]{3,20}$/).test(input.storeIdentifier)) {
    errors.storeIdentifier = api ? '영문 소문자와 숫자로 4자 이상 입력해주세요.' : v2 ? '영문 소문자와 숫자로 4~20자 입력해주세요.' : '영문 소문자, 숫자, 하이픈으로 3~20자 입력해주세요.';
  }

  return errors;
}

export function useStoreForm(service: Pick<SalesManagementService, 'checkStoreIdentifier' | 'saveStore'> & { dataSource?: 'api' | 'mock' },
  initialStore: SalesStore | null = null, v2 = false, onSaved?: (store: SalesStore) => void) {
  const api = service.dataSource === 'api';
  const [input, setInput] = useState<StoreFormInput>(initialStore ? { name: initialStore.name, storeIdentifier: initialStore.storeIdentifier } : initialInput);
  const [errors, setErrors] = useState<Partial<Record<keyof StoreFormInput, string>>>({});
  const [identifierStatus, setIdentifierStatus] = useState<IdentifierStatus>(initialStore ? 'available' : 'idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredStore, setRegisteredStore] = useState<SalesStore | null>(initialStore);
  const version = useRef(0);
  const busy = useRef(false);

  const updateInput = (field: keyof StoreFormInput, value: string) => {
    const nextValue = field === 'storeIdentifier' ? value.toLowerCase() : value;

    setInput((current) => ({ ...current, [field]: nextValue }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError(null);
    if (field === 'storeIdentifier') {
      version.current += 1;
      setIdentifierStatus(nextValue === registeredStore?.storeIdentifier ? 'available' : 'idle');
    }
  };

  const checkIdentifier = async () => {
    const identifierError = validateStoreInput(input, v2, api).storeIdentifier;
    if (identifierError) {
      setErrors((current) => ({ ...current, storeIdentifier: identifierError }));
      return;
    }

    if (input.storeIdentifier === registeredStore?.storeIdentifier) { setIdentifierStatus('available'); return; }
    const checkedVersion = version.current;
    setErrors(current => ({ ...current, storeIdentifier: undefined }));
    setIdentifierStatus('checking');
    setSubmitError(null);

    try {
      const isAvailable = await service.checkStoreIdentifier(input.storeIdentifier);
      if (version.current !== checkedVersion) return;
      setIdentifierStatus(isAvailable ? 'available' : 'unavailable');
      if (!isAvailable) {
        setErrors((current) => ({ ...current, storeIdentifier: '이미 사용 중인 상점 아이디입니다.' }));
      }
    } catch (error) {
      if (version.current !== checkedVersion) return;
      setIdentifierStatus('error');
      setErrors((current) => ({
        ...current,
        storeIdentifier:
          error instanceof Error ? error.message : '아이디 확인 중 오류가 발생했습니다.',
      }));
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current) return;
    const nextErrors = validateStoreInput(input, v2, api);
    if (identifierStatus !== 'available') {
      nextErrors.storeIdentifier ??= '상점 아이디 중복 확인을 해주세요.';
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    busy.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await service.saveStore(input);
      setRegisteredStore(saved);
      onSaved?.(saved);
    } catch (error) {
      if (error instanceof StoreApiError && error.code === 'STORE_SLUG_TAKEN') setIdentifierStatus('unavailable');
      setSubmitError(error instanceof Error ? error.message : '상점 등록에 실패했습니다.');
    } finally {
      busy.current = false;
      setIsSubmitting(false);
    }
  };

  const canSubmit = identifierStatus === 'available' && !isSubmitting && Object.keys(validateStoreInput(input, v2, api)).length === 0;

  return { canSubmit, input, errors, identifierStatus, submitError, isSubmitting, registeredStore, setRegisteredStore, updateInput, checkIdentifier, submit };
}
