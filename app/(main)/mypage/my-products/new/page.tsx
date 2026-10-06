'use client';

import { NavBar } from '@/components/layout';
import { useUser } from '@/hooks/useUser';
import {
  newProductStep1Schema,
  newProductStep2BuyNowSchema,
  newProductStep2DeliverySchema,
  newProductStep2PickupSchema,
  PRODUCT_NAME_MAX_LENGTH,
} from '@/lib/validations/product';
import { PRODUCT_TYPE_OPTIONS, isDisabledProductType } from '@/lib/product-type';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, parseISO } from 'date-fns';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { shift } from '@floating-ui/react-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useForm, Controller } from 'react-hook-form';
import RadioButton from '@/components/ui/button/RadioButton';
import OptionName from '@/components/ui/admin/product/OptionName';
import OptionVariation from '@/components/ui/admin/product/OptionVariation';
import { useQuery } from '@tanstack/react-query';
import type {
  NewProductStep1Input,
  NewProductStep2BuyNowInput,
  NewProductStep2DeliveryInput,
  NewProductStep2PickupInput,
} from '@/lib/validations/product';
import { ko } from 'date-fns/locale';

interface TeamItem {
  id: string;
  teamName: string;
}

async function uploadProductImage(file: File, usage: 'PRODUCT_THUMBNAIL' | 'PRODUCT_DETAIL'): Promise<string> {
  const form = new FormData();
  form.append('image', file);
  form.append('usage', usage);
  const res = await fetch('/api/v1/images', { method: 'POST', body: form });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { message?: string }).message || '이미지 업로드에 실패했습니다.');
  }
  const data = (await res.json()) as { data?: { imageUrl?: string } };
  const url = data.data?.imageUrl;
  if (!url) throw new Error('이미지 URL을 받지 못했습니다.');
  return url;
}

function ThumbnailPreview({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!src) return <span className="typo-body-xsmall text-neutral-6">...</span>;
  return (
    <span className="relative block h-full w-full">
      <Image src={src} alt="" fill unoptimized sizes="200px" className="object-cover" />
    </span>
  );
}

function DetailPreview({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!src) return <span className="typo-body-xsmall text-neutral-6">...</span>;
  return (
    <span className="relative block h-full w-full">
      <Image src={src} alt="" fill unoptimized sizes="400px" className="object-cover" />
    </span>
  );
}

async function fetchTeams(): Promise<TeamItem[]> {
  const res = await fetch('/api/user/teams');
  if (!res.ok) throw new Error('Failed to fetch teams');
  return res.json();
}

function parseOrNull(dateStr: string): Date | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  try {
    const d = parseISO(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function getDuplicateOptionNames(options: Array<{ optionName: string }>) {
  const counts = new Map<string, number>();
  for (const option of options) {
    const key = option.optionName.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
}

function getDuplicateOptionValuesByOptionId<T extends { id: string; values: Array<{ value: string }> }>(options: T[]) {
  const result = new Map<string, Set<string>>();
  for (const option of options) {
    const counts = new Map<string, number>();
    for (const value of option.values) {
      const key = value.value.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    result.set(option.id, new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key)));
  }
  return result;
}

function TeamDropdown({
  value,
  onChange,
  error,
  teams,
  isLoading,
}: {
  value: string;
  onChange: (teamId: string, teamName: string) => void;
  error?: string;
  teams: TeamItem[];
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedTeam = teams.find((t) => t.id === value);
  const filtered = search.trim()
    ? teams.filter((t) => t.teamName.toLowerCase().includes(search.trim().toLowerCase()))
    : teams;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-12 w-full items-center justify-between rounded-lg border bg-neutral-1 px-4 typo-body-small text-neutral-12',
          error ? 'border-red-5' : 'border-neutral-5'
        )}
      >
        <span className={selectedTeam ? 'text-neutral-12' : 'text-neutral-6'}>
          {selectedTeam ? selectedTeam.teamName : '판매팀을 선택하세요'}
        </span>
        <Image src="/assets/icons/icon-right.svg" alt="" width={20} height={20} className={open ? 'rotate-90' : ''} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-60 overflow-hidden rounded-lg border border-neutral-5 bg-neutral-1 shadow-lg">
          <div className="border-b border-neutral-4 p-2">
            <input
              type="text"
              placeholder="팀 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded border border-neutral-5 bg-neutral-3 px-3 typo-body-xsmall text-neutral-12 placeholder:text-neutral-6"
            />
          </div>
          <ul className="max-h-44 overflow-y-auto py-1">
            {isLoading ? (
              <li className="px-4 py-3 typo-body-xsmall text-neutral-7">로딩 중...</li>
            ) : filtered.length === 0 ? (
              <li className="px-4 py-3 typo-body-xsmall text-neutral-7">등록된 팀이 없습니다.</li>
            ) : (
              filtered.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(team.id, team.teamName);
                      setOpen(false);
                      setSearch('');
                    }}
                    className="w-full px-4 py-3 text-left typo-body-small text-neutral-12 hover:bg-neutral-3"
                  >
                    {team.teamName}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {error && <p className="mt-1 typo-body-xsmall text-red-5">{error}</p>}
    </div>
  );
}

/** 정사각형 단계 표시: 완료/현재/비활성 */
function StepIndicator({ currentStep, totalSteps = 3 }: { currentStep: number; totalSteps?: number }) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);
  return (
    <div
      className="mb-6 flex justify-center gap-2"
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-label={`등록 단계 ${currentStep} of ${totalSteps}`}
    >
      {steps.map((step) => {
        const isCompleted = step < currentStep;
        const isCurrent = step === currentStep;
        return (
          <span
            key={step}
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
              isCompleted && 'bg-orange-6',
              isCurrent && 'border-2 border-orange-6 bg-orange-1',
              !isCompleted && !isCurrent && 'bg-neutral-4'
            )}
          >
            {isCompleted && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M9.5 11.5L11.5 13.5L15.5 9.5"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function NewProductPage() {
  const router = useRouter();
  const { profile, isLoading: userLoading, isAuthenticated } = useUser();

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['user', 'teams'],
    queryFn: fetchTeams,
    enabled: isAuthenticated,
  });

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<NewProductStep1Input>({
    resolver: zodResolver(newProductStep1Schema),
    defaultValues: {
      teamId: '',
      name: '',
      description: '',
      type: 0,
      receiveMethod: 0,
      salesStartDate: '',
      salesEndDate: '',
    },
  });

  const teamId = watch('teamId');
  const nameValue = watch('name') ?? '';
  const descriptionValue = watch('description') ?? '';
  const receiveMethodWatch = watch('receiveMethod');
  const nameOverLimit = nameValue.length > PRODUCT_NAME_MAX_LENGTH;
  const salesStartDateStr = watch('salesStartDate');
  const salesEndDateStr = watch('salesEndDate');

  const salesStartDate = salesStartDateStr ? parseOrNull(salesStartDateStr) : null;
  const salesEndDate = salesEndDateStr ? parseOrNull(salesEndDateStr) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [detailFiles, setDetailFiles] = useState<File[]>([]);
  const [detailDragIndex, setDetailDragIndex] = useState<number | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const detailInputRef = useRef<HTMLInputElement>(null);

  const THUMBNAIL_MAX = 1;
  const DETAIL_MAX = 10;
  const MAX_OPTION_CARD_COUNT = 2;

  const handleDetailReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setDetailFiles((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return next;
    });
    setDetailDragIndex(null);
  };

  useEffect(() => {
    if (!userLoading && !isAuthenticated) router.replace('/login');
  }, [userLoading, isAuthenticated, router]);

  const [step1Data, setStep1Data] = useState<NewProductStep1Input | null>(null);

  const productType = step1Data?.type ?? 0;
  const receiveMethod = step1Data?.receiveMethod ?? 0;
  const isBuyNow = productType === 1;
  const isPartnerUp = productType === 2;
  const isFundDelivery = productType === 0 && receiveMethod === 0;
  const isFundPickup = productType === 0 && receiveMethod === 1;

  const step2DeliveryForm = useForm<NewProductStep2DeliveryInput>({
    resolver: zodResolver(newProductStep2DeliverySchema),
    defaultValues: {
      goalAmount: 0,
      productionStartDate: '',
      productionEndDate: '',
      deliveryStartDate: '',
      deliveryEndDate: '',
    },
  });
  const step2PickupForm = useForm<NewProductStep2PickupInput>({
    resolver: zodResolver(newProductStep2PickupSchema),
    defaultValues: {
      goalAmount: 0,
      pickupStartDate: '',
      pickupEndDate: '',
      pickupLocation: '',
    },
  });

  type BuyNowOptionValue = { id: string; value: string; extraPrice: number };
  type BuyNowOption = { id: string; optionName: string; values: BuyNowOptionValue[] };
  const [buyNowOptions, setBuyNowOptions] = useState<BuyNowOption[]>([]);
  const [focusedBuyNowOptionNameId, setFocusedBuyNowOptionNameId] = useState<string | null>(null);
  const [focusedBuyNowOptionValueId, setFocusedBuyNowOptionValueId] = useState<string | null>(null);

  const step2BuyNowForm = useForm<NewProductStep2BuyNowInput>({
    resolver: zodResolver(newProductStep2BuyNowSchema),
    defaultValues: { price: 0, options: [] },
  });
  const {
    register: registerStep2BuyNow,
    handleSubmit: handleSubmitStep2BuyNow,
    setValue: setValueStep2BuyNow,
    watch: watchStep2BuyNow,
    formState: { errors: errorsStep2BuyNow },
  } = step2BuyNowForm;

  const {
    register: registerStep2Delivery,
    handleSubmit: handleSubmitStep2Delivery,
    control: controlStep2Delivery,
    setValue: setValueStep2Delivery,
    watch: watchStep2Delivery,
    formState: { errors: errorsStep2Delivery },
  } = step2DeliveryForm;
  const {
    register: registerStep2Pickup,
    handleSubmit: handleSubmitStep2Pickup,
    control: controlStep2Pickup,
    setValue: setValueStep2Pickup,
    watch: watchStep2Pickup,
    formState: { errors: errorsStep2Pickup },
  } = step2PickupForm;

  const productionStartStr = watchStep2Delivery('productionStartDate');
  const productionEndStr = watchStep2Delivery('productionEndDate');
  const deliveryStartStr = watchStep2Delivery('deliveryStartDate');
  const deliveryEndStr = watchStep2Delivery('deliveryEndDate');
  const deliveryGoalAmount = watchStep2Delivery('goalAmount');
  const productionStartDate = productionStartStr ? parseOrNull(productionStartStr) : null;
  const productionEndDate = productionEndStr ? parseOrNull(productionEndStr) : null;
  const deliveryStartDate = deliveryStartStr ? parseOrNull(deliveryStartStr) : null;
  const deliveryEndDate = deliveryEndStr ? parseOrNull(deliveryEndStr) : null;

  const pickupStartStr = watchStep2Pickup('pickupStartDate');
  const pickupEndStr = watchStep2Pickup('pickupEndDate');
  const pickupGoalAmount = watchStep2Pickup('goalAmount');
  const pickupLocation = watchStep2Pickup('pickupLocation');
  const pickupStartDate = pickupStartStr ? parseOrNull(pickupStartStr) : null;
  const pickupEndDate = pickupEndStr ? parseOrNull(pickupEndStr) : null;
  const buyNowPrice = watchStep2BuyNow('price');

  const productTypeWatch = watch('type');
  useEffect(() => {
    if (productTypeWatch === 1) setValue('receiveMethod', 1);
    if (productTypeWatch === 2) setValue('receiveMethod', 0);
  }, [productTypeWatch, setValue]);

  const onSubmitStep1 = (data: NewProductStep1Input) => {
    setStep1Data(data);
    if (data.type === 1) setCurrentStep(2);
    else if (data.type === 0) setCurrentStep(2);
    else if (data.type === 2) {
      // Partner Up: 등록요청
      router.push('/mypage/my-products');
    }
  };

  const onMoveStep2WithoutValidation = () => {
    const draft = getValues();
    const normalizedDraft = {
      ...draft,
      receiveMethod: draft.type === 1 ? 1 : draft.type === 2 ? 0 : draft.receiveMethod,
    };
    setStep1Data(normalizedDraft as NewProductStep1Input);
    setCurrentStep(2);
  };

  const onRequestPartnerUpWithoutValidation = () => {
    const draft = getValues();
    const normalizedDraft = {
      ...draft,
      receiveMethod: draft.type === 1 ? 1 : draft.type === 2 ? 0 : draft.receiveMethod,
    };
    setStep1Data(normalizedDraft as NewProductStep1Input);
    router.push('/mypage/my-products');
  };

  const onSubmitStep2Delivery = (_data: NewProductStep2DeliveryInput) => {
    setCurrentStep(3);
  };

  const onSubmitStep2Pickup = (_data: NewProductStep2PickupInput) => {
    setCurrentStep(3);
  };

  const onMoveStep3WithoutValidation = () => {
    setCurrentStep(3);
  };

  const [fundStep3Options, setFundStep3Options] = useState<BuyNowOption[]>([]);
  const [focusedFundOptionNameId, setFocusedFundOptionNameId] = useState<string | null>(null);
  const [focusedFundOptionValueId, setFocusedFundOptionValueId] = useState<string | null>(null);
  const step3FundForm = useForm<NewProductStep2BuyNowInput>({
    resolver: zodResolver(newProductStep2BuyNowSchema),
    defaultValues: { price: 0, options: [] },
  });
  const {
    register: registerStep3Fund,
    handleSubmit: handleSubmitStep3Fund,
    watch: watchStep3Fund,
    formState: { errors: errorsStep3Fund },
  } = step3FundForm;
  const fundPrice = watchStep3Fund('price');

  const onSubmitStep3Fund = async (data: NewProductStep2BuyNowInput) => {
    if (!step1Data || !thumbnailFile || detailFiles.length === 0) {
      alert('필수 항목(팀/상품정보, 썸네일, 상세 이미지 1장 이상)을 확인해주세요.');
      return;
    }
    const step2Data = isFundDelivery ? step2DeliveryForm.getValues() : step2PickupForm.getValues();
    setSubmittingRegistration(true);
    setRegistrationError(null);
    try {
      const thumbnailImgUrl = await uploadProductImage(thumbnailFile, 'PRODUCT_THUMBNAIL');
      const detailImgUrls = await Promise.all(detailFiles.map((f) => uploadProductImage(f, 'PRODUCT_DETAIL')));
      const optionsPayload = fundStep3Options
        .filter((o) => o.optionName.trim())
        .map((o) => ({ optionName: o.optionName.trim(), values: o.values.map((v) => ({ value: v.value.trim(), extraPrice: v.extraPrice })) }));
      const body = {
        ...step1Data,
        goalAmount: step2Data.goalAmount,
        ...(isFundDelivery
          ? {
              productionStartDate: (step2Data as NewProductStep2DeliveryInput).productionStartDate,
              productionEndDate: (step2Data as NewProductStep2DeliveryInput).productionEndDate,
              deliveryStartDate: (step2Data as NewProductStep2DeliveryInput).deliveryStartDate,
              deliveryEndDate: (step2Data as NewProductStep2DeliveryInput).deliveryEndDate,
            }
          : {
              pickupStartDate: (step2Data as NewProductStep2PickupInput).pickupStartDate,
              pickupEndDate: (step2Data as NewProductStep2PickupInput).pickupEndDate,
              pickupLocation: (step2Data as NewProductStep2PickupInput).pickupLocation,
            }),
        price: data.price,
        options: optionsPayload,
        thumbnailImgUrl,
        detailImgUrls,
      };
      const res = await fetch('/api/v1/mypage/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: { message?: string } };
      if (!res.ok) {
        setRegistrationError(json.message || json.data?.message || '등록 요청에 실패했습니다.');
        return;
      }
      router.push('/mypage/my-products');
    } catch (e) {
      setRegistrationError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setSubmittingRegistration(false);
    }
  };

  const nextIdFund = () => `f3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const addFundStep3Option = () => {
    setFundStep3Options((prev) => {
      if (prev.length >= MAX_OPTION_CARD_COUNT) return prev;
      return [...prev, { id: nextIdFund(), optionName: '', values: [{ id: nextIdFund(), value: '', extraPrice: 0 }] }];
    });
  };
  const removeFundStep3Option = (optionId: string) => {
    setFundStep3Options((prev) => prev.filter((o) => o.id !== optionId));
  };
  const addFundStep3OptionValue = (optionId: string) => {
    setFundStep3Options((prev) =>
      prev.map((o) => (o.id === optionId ? { ...o, values: [...o.values, { id: nextIdFund(), value: '', extraPrice: 0 }] } : o))
    );
  };
  const removeFundStep3OptionValue = (optionId: string, valueId: string) => {
    setFundStep3Options((prev) =>
      prev.map((o) => {
        if (o.id !== optionId) return o;
        if (o.values.length <= 1) return o;
        return { ...o, values: o.values.filter((v) => v.id !== valueId) };
      })
    );
  };
  const updateFundStep3OptionName = (optionId: string, optionName: string) => {
    setFundStep3Options((prev) => prev.map((o) => (o.id === optionId ? { ...o, optionName } : o)));
  };
  const updateFundStep3OptionValue = (optionId: string, valueId: string, field: 'value' | 'extraPrice', val: string | number) => {
    setFundStep3Options((prev) =>
      prev.map((o) =>
        o.id === optionId
          ? { ...o, values: o.values.map((v) => (v.id === valueId ? { ...v, [field]: field === 'extraPrice' ? Number(val) || 0 : val } : v)) }
          : o
      )
    );
  };

  const [isSubmittingRegistration, setSubmittingRegistration] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [showRegistrationConfirmModal, setShowRegistrationConfirmModal] = useState(false);
  const [pendingRegistrationType, setPendingRegistrationType] = useState<'buyNow' | 'fund' | null>(null);

  const isStep1RequiredValid = useMemo(() => {
    if (!step1Data) return false;
    return newProductStep1Schema.safeParse(step1Data).success;
  }, [step1Data]);

  const isStep1DraftRequiredValid = useMemo(() => {
    const draft = getValues();
    return newProductStep1Schema.safeParse({
      ...draft,
      teamId,
      name: nameValue,
      description: descriptionValue,
      type: productTypeWatch,
      receiveMethod: receiveMethodWatch,
      salesStartDate: salesStartDateStr,
      salesEndDate: salesEndDateStr,
    }).success;
  }, [
    getValues,
    teamId,
    nameValue,
    descriptionValue,
    productTypeWatch,
    receiveMethodWatch,
    salesStartDateStr,
    salesEndDateStr,
  ]);

  const hasRequiredImages = Boolean(thumbnailFile) && detailFiles.length > 0;

  const isBuyNowStep2Valid = useMemo(() => {
    return newProductStep2BuyNowSchema.safeParse(step2BuyNowForm.getValues()).success;
  }, [step2BuyNowForm, buyNowPrice]);

  const isFundStep2Valid = useMemo(() => {
    if (isFundDelivery) {
      return newProductStep2DeliverySchema.safeParse(step2DeliveryForm.getValues()).success;
    }
    return newProductStep2PickupSchema.safeParse(step2PickupForm.getValues()).success;
  }, [
    isFundDelivery,
    step2DeliveryForm,
    step2PickupForm,
    deliveryGoalAmount,
    productionStartStr,
    productionEndStr,
    deliveryStartStr,
    deliveryEndStr,
    pickupGoalAmount,
    pickupStartStr,
    pickupEndStr,
    pickupLocation,
  ]);

  const isFundStep3Valid = useMemo(() => {
    return newProductStep2BuyNowSchema.safeParse(step3FundForm.getValues()).success;
  }, [step3FundForm, fundPrice]);

  const isBuyNowRegistrationEnabled = !isSubmittingRegistration && isStep1RequiredValid && hasRequiredImages && isBuyNowStep2Valid;
  const isFundRegistrationEnabled =
    !isSubmittingRegistration && isStep1RequiredValid && hasRequiredImages && isFundStep2Valid && isFundStep3Valid;
  const isPartnerUpRegistrationEnabled = !isSubmitting && !nameOverLimit && isStep1DraftRequiredValid && hasRequiredImages;

  const duplicateBuyNowOptionNames = useMemo(() => getDuplicateOptionNames(buyNowOptions), [buyNowOptions]);
  const duplicateBuyNowOptionValuesByOptionId = useMemo(() => getDuplicateOptionValuesByOptionId(buyNowOptions), [buyNowOptions]);
  const duplicateFundOptionNames = useMemo(() => getDuplicateOptionNames(fundStep3Options), [fundStep3Options]);
  const duplicateFundOptionValuesByOptionId = useMemo(() => getDuplicateOptionValuesByOptionId(fundStep3Options), [fundStep3Options]);

  const onSubmitStep2BuyNow = async (data: NewProductStep2BuyNowInput) => {
    if (!step1Data || !thumbnailFile || detailFiles.length === 0) {
      alert('필수 항목(팀/상품정보, 썸네일, 상세 이미지 1장 이상)을 확인해주세요.');
      return;
    }
    setSubmittingRegistration(true);
    setRegistrationError(null);
    try {
      const thumbnailImgUrl = await uploadProductImage(thumbnailFile, 'PRODUCT_THUMBNAIL');
      const detailImgUrls = await Promise.all(detailFiles.map((f) => uploadProductImage(f, 'PRODUCT_DETAIL')));
      const optionsPayload = buyNowOptions
        .filter((o) => o.optionName.trim())
        .map((o) => ({ optionName: o.optionName.trim(), values: o.values.map((v) => ({ value: v.value.trim(), extraPrice: v.extraPrice })) }));
      const body = {
        ...step1Data,
        price: data.price,
        options: optionsPayload,
        thumbnailImgUrl,
        detailImgUrls,
      };
      const res = await fetch('/api/v1/mypage/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; data?: { message?: string } };
      if (!res.ok) {
        setRegistrationError(json.message || json.data?.message || '등록 요청에 실패했습니다.');
        return;
      }
      router.push('/mypage/my-products');
    } catch (e) {
      setRegistrationError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setSubmittingRegistration(false);
    }
  };

  const onBackToStep1 = () => setCurrentStep(1);

  const nextId = () => `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const addBuyNowOption = () => {
    setBuyNowOptions((prev) => {
      if (prev.length >= MAX_OPTION_CARD_COUNT) return prev;
      return [...prev, { id: nextId(), optionName: '', values: [{ id: nextId(), value: '', extraPrice: 0 }] }];
    });
  };
  const removeBuyNowOption = (optionId: string) => {
    setBuyNowOptions((prev) => prev.filter((o) => o.id !== optionId));
  };
  const addBuyNowOptionValue = (optionId: string) => {
    setBuyNowOptions((prev) =>
      prev.map((o) => (o.id === optionId ? { ...o, values: [...o.values, { id: nextId(), value: '', extraPrice: 0 }] } : o))
    );
  };
  const removeBuyNowOptionValue = (optionId: string, valueId: string) => {
    setBuyNowOptions((prev) =>
      prev.map((o) => {
        if (o.id !== optionId) return o;
        if (o.values.length <= 1) return o;
        return { ...o, values: o.values.filter((v) => v.id !== valueId) };
      })
    );
  };
  const updateBuyNowOptionName = (optionId: string, optionName: string) => {
    setBuyNowOptions((prev) => prev.map((o) => (o.id === optionId ? { ...o, optionName } : o)));
  };
  const updateBuyNowOptionValue = (optionId: string, valueId: string, field: 'value' | 'extraPrice', val: string | number) => {
    setBuyNowOptions((prev) =>
      prev.map((o) =>
        o.id === optionId
          ? { ...o, values: o.values.map((v) => (v.id === valueId ? { ...v, [field]: field === 'extraPrice' ? Number(val) || 0 : val } : v)) }
          : o
      )
    );
  };

  if (userLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="typo-body-xsmall text-neutral-7">로딩 중...</p>
      </div>
    );
  }

  if (profile?.isSeller !== true) {
    router.replace('/mypage/my-products');
    return null;
  }

  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col overflow-x-hidden">
      <NavBar variant="title-back" title="상품 등록" />

      <div className="mx-auto w-full min-w-0 max-w-[375px] flex-1 px-4 pb-8 pt-4">
        <StepIndicator
          currentStep={currentStep}
          totalSteps={(step1Data?.type ?? productTypeWatch) === 2 ? 1 : (step1Data?.type ?? productTypeWatch) === 1 ? 2 : 3}
        />

        {currentStep === 1 && (
        <form onSubmit={handleSubmit(onSubmitStep1)} className="min-w-0 space-y-5">
          {/* 판매팀 */}
          <section>
            <label className="typo-body-small-bold text-neutral-12">
              판매팀 <span className="text-orange-5">*</span>
            </label>
            <div className="mt-1">
              <TeamDropdown
                value={teamId}
                onChange={(id) => setValue('teamId', id, { shouldValidate: true })}
                error={errors.teamId?.message}
                teams={teams}
                isLoading={teamsLoading}
              />
            </div>
          </section>

          {/* 상품명 */}
          <section>
            <label
              className={cn(
                'typo-body-small-bold',
                (errors.name || nameOverLimit) ? 'text-red-5' : 'text-neutral-12'
              )}
            >
              상품명<span className={(errors.name || nameOverLimit) ? 'text-red-5' : 'text-orange-5'}>*</span>
            </label>
            <div className="relative mt-1">
              <input
                {...register('name')}
                maxLength={PRODUCT_NAME_MAX_LENGTH}
                placeholder="예) ECO 북극곰 텀블러"
                className={cn(
                  'h-12 w-full rounded-lg border bg-neutral-1 px-4 pr-10 typo-body-small text-neutral-12 placeholder:text-neutral-6',
                  (errors.name || nameOverLimit) ? 'border-red-5' : 'border-neutral-5'
                )}
              />
              {(errors.name || nameOverLimit) && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
                  <Image src="/assets/icons/icon-warning-triangle.svg" alt="" width={20} height={20} />
                </span>
              )}
            </div>
            {(errors.name?.message || nameOverLimit) && (
              <p className="mt-1 typo-body-xsmall text-red-5" role="alert">
                {nameOverLimit ? '상품명은 13자 이하여야 합니다.' : errors.name?.message}
              </p>
            )}
          </section>

          {/* 상품 설명 */}
          <section>
            <label className="typo-body-small-bold text-neutral-12">
              상품 설명 <span className="text-orange-5">*</span>
            </label>
            <input
              {...register('description')}
              placeholder="예) 상품을 한 줄로 설명해 주세요"
              className="mt-1 h-12 w-full rounded-lg border border-neutral-5 bg-neutral-1 px-4 typo-body-small text-neutral-12 placeholder:text-neutral-6"
            />
            {errors.description && (
              <p className="mt-1 typo-body-xsmall text-red-5">{errors.description.message}</p>
            )}
          </section>

          {/* 상품 유형 */}
          <section>
            <label className="typo-body-small-bold text-neutral-12">
              상품 유형 <span className="text-orange-5">*</span>
            </label>
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <div className="mt-2 overflow-hidden rounded-lg border border-neutral-5 bg-neutral-1">
                  {PRODUCT_TYPE_OPTIONS.map((opt, i) => {
                    const disabled = isDisabledProductType(opt.value);
                    return (
                      <div
                        key={opt.value}
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-disabled={disabled}
                        onClick={disabled ? undefined : () => field.onChange(opt.value)}
                        onKeyDown={(e) => !disabled && e.key === 'Enter' && field.onChange(opt.value)}
                        className={cn(
                          'flex items-center px-4 py-3',
                          disabled ? 'cursor-not-allowed bg-neutral-3 opacity-50' : 'cursor-pointer',
                          i > 0 && 'border-t border-neutral-4'
                        )}
                      >
                        <RadioButton
                          checked={field.value === opt.value}
                          onChange={disabled ? undefined : () => field.onChange(opt.value)}
                          disabled={disabled}
                          label={opt.label}
                          value={opt.value}
                          className="w-full"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            />
          </section>

          {/* 수령 방식: Fund=선택 가능, Buy Now=현장 수령, Partner Up=현장 수령 */}
          <section>
            <label className="typo-body-small-bold text-neutral-12">
              수령 방식 <span className="text-orange-5">*</span>
            </label>
            {productTypeWatch === 2 ? (
              <>
                <p className="mt-1 typo-body-xsmall text-neutral-7">
                  Partner Up은 현장 수령만 가능합니다.
                </p>
                <div className="mt-2 overflow-hidden rounded-lg border border-neutral-5 bg-neutral-3">
                  {[
                    { value: 0, label: '택배 배송' },
                    { value: 1, label: '현장 수령' },
                  ].map((opt, i) => (
                    <div
                      key={opt.value}
                      className={cn(
                        'flex items-center px-4 py-3 opacity-60',
                        i > 0 && 'border-t border-neutral-4'
                      )}
                    >
                      <RadioButton
                        checked={false}
                        label={opt.label}
                        disabled
                        value={opt.value}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : productTypeWatch === 1 ? (
              <>
                <p className="mt-1 typo-body-xsmall text-neutral-7">
                  Buy Now는 현장 수령만 가능합니다.
                </p>
                <div className="mt-2 overflow-hidden rounded-lg border border-neutral-5 bg-neutral-1">
                  <div className="flex items-center px-4 py-3 opacity-60">
                    <RadioButton checked={false} label="택배 배송" disabled value={0} />
                  </div>
                  <div className="pointer-events-none flex items-center border-t border-neutral-4 px-4 py-3">
                    <RadioButton checked label="현장 수령" value={1} className="w-full" />
                  </div>
                </div>
              </>
            ) : (
              <Controller
                name="receiveMethod"
                control={control}
                render={({ field }) => (
                  <div className="mt-2 overflow-hidden rounded-lg border border-neutral-5 bg-neutral-1">
                    {[
                      { value: 0, label: '택배 배송' },
                      { value: 1, label: '현장 수령' },
                    ].map((opt, i) => (
                      <div
                        key={opt.value}
                        role="button"
                        tabIndex={0}
                        onClick={() => field.onChange(opt.value)}
                        onKeyDown={(e) => e.key === 'Enter' && field.onChange(opt.value)}
                        className={cn(
                          'flex cursor-pointer items-center px-4 py-3',
                          i > 0 && 'border-t border-neutral-4'
                        )}
                      >
                        <RadioButton
                          checked={field.value === opt.value}
                          onChange={() => field.onChange(opt.value)}
                          label={opt.label}
                          value={opt.value}
                          className="w-full"
                        />
                      </div>
                    ))}
                  </div>
                )}
              />
            )}
          </section>

          {/* 판매 기간 */}
          <section>
            <label className="typo-body-small-bold text-neutral-12">
              판매 기간 <span className="text-orange-5">*</span>
            </label>
            <div className="date-range-field mt-1 flex min-w-0 flex-nowrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <Controller
                  name="salesStartDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      selected={salesStartDate}
                      onChange={(date: Date | null) => {
                        const value = date ? format(date, 'yyyy-MM-dd') : '';
                        field.onChange(value);
                        if (salesEndDate && date && salesEndDate < date) {
                          setValue('salesEndDate', value);
                        }
                      }}
                      onBlur={field.onBlur}
                      minDate={today}
                      locale={ko}
                      dateFormat="yyyy-MM-dd"
                      placeholderText="YYYY-MM-DD"
                      popperPlacement="bottom-start"
                      popperModifiers={[shift({ padding: 8 })]}
                      className={cn(
                        'h-12 w-full min-w-0 rounded-lg border bg-neutral-1 px-4 typo-body-small text-neutral-12',
                        errors.salesStartDate ? 'border-red-5' : 'border-neutral-5'
                      )}
                      calendarClassName="gcs-datepicker-calendar"
                    />
                  )}
                />
              </div>
              <span className="shrink-0 typo-body-small-bold text-neutral-8">~</span>
              <div className="min-w-0 flex-1">
                <Controller
                  name="salesEndDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      selected={salesEndDate}
                      onChange={(date: Date | null) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                      onBlur={field.onBlur}
                      minDate={salesStartDate ?? today}
                      locale={ko}
                      dateFormat="yyyy-MM-dd"
                      placeholderText="YYYY-MM-DD"
                      popperPlacement="bottom-start"
                      popperModifiers={[shift({ padding: 8 })]}
                      className={cn(
                        'h-12 w-full min-w-0 rounded-lg border bg-neutral-1 px-4 typo-body-small text-neutral-12',
                        errors.salesEndDate ? 'border-red-5' : 'border-neutral-5'
                      )}
                      calendarClassName="gcs-datepicker-calendar"
                    />
                  )}
                />
              </div>
              <span className="shrink-0 typo-body-small-bold text-neutral-8">까지</span>
            </div>
            {(errors.salesStartDate || errors.salesEndDate) && (
              <p className="mt-1 typo-body-xsmall text-red-5">
                {errors.salesStartDate?.message ?? errors.salesEndDate?.message}
              </p>
            )}
          </section>

          {/* 썸네일 이미지 */}
          <section>
            <label className="typo-body-small-bold text-neutral-12">
              썸네일 이미지 <span className="text-orange-5">*</span>
            </label>
            <p className="mt-1 typo-body-xsmall text-neutral-7">대표 이미지는 최소 1장 등록해 주세요.</p>
            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setThumbnailFile(file);
                e.target.value = '';
              }}
            />
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {thumbnailFile && (
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-neutral-5 bg-neutral-3">
                  <ThumbnailPreview file={thumbnailFile} />
                </div>
              )}
              {!thumbnailFile && (
                <button
                  type="button"
                  onClick={() => thumbnailInputRef.current?.click()}
                  className="flex h-24 w-24 min-w-[96px] cursor-pointer items-center justify-center rounded-lg border border-neutral-5 bg-neutral-3 transition-colors hover:bg-neutral-4"
                >
                  <span className="typo-body-xsmall text-neutral-6">0/{THUMBNAIL_MAX}</span>
                </button>
              )}
              {thumbnailFile && (
                <button
                  type="button"
                  onClick={() => thumbnailInputRef.current?.click()}
                  className="flex h-24 w-24 min-w-[96px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-neutral-5 typo-body-xsmall text-neutral-6 hover:bg-neutral-3"
                >
                  변경
                </button>
              )}
            </div>
          </section>

          {/* 상세페이지 이미지 */}
          <section>
            <label className="typo-body-small-bold text-neutral-12">
              상세페이지 이미지 <span className="text-orange-5">*</span>
            </label>
            <p className="mt-1 typo-body-xsmall text-neutral-7">
              최소 1장 이상 등록해 주세요. 드래그로 이미지 순서를 변경할 수 있습니다.
            </p>
            <input
              ref={detailInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                setDetailFiles((prev) => [...prev, ...list].slice(0, DETAIL_MAX));
                e.target.value = '';
              }}
            />
            <ul className="mt-2 flex flex-wrap gap-2">
              {detailFiles.map((file, index) => (
                <li
                  key={index}
                  draggable
                  onDragStart={(e) => {
                    setDetailDragIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(index));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (detailDragIndex === null) return;
                    handleDetailReorder(detailDragIndex, index);
                  }}
                  onDragEnd={() => setDetailDragIndex(null)}
                  className={cn(
                    'relative flex h-24 w-24 shrink-0 cursor-grab items-center justify-center overflow-hidden rounded-lg border border-neutral-5 bg-neutral-3 active:cursor-grabbing',
                    detailDragIndex === index && 'opacity-60'
                  )}
                >
                  <DetailPreview file={file} />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/50 py-0.5 text-center text-[10px] text-white">
                    {index + 1}
                  </span>
                </li>
              ))}
              {detailFiles.length < DETAIL_MAX && (
                <li>
                  <button
                    type="button"
                    onClick={() => detailInputRef.current?.click()}
                    className="flex h-24 w-24 min-w-[96px] cursor-pointer items-center justify-center rounded-lg border border-neutral-5 bg-neutral-3 transition-colors hover:bg-neutral-4"
                  >
                    <span className="typo-body-xsmall text-neutral-6">
                      + {detailFiles.length}/{DETAIL_MAX}
                    </span>
                  </button>
                </li>
              )}
            </ul>
            <p className="mt-1 typo-body-xsmall text-neutral-7">최대 {DETAIL_MAX}장, 드래그로 순서 변경</p>
          </section>

          <div className="pt-4">
            <button
              type="button"
              onClick={productTypeWatch === 2 ? onRequestPartnerUpWithoutValidation : onMoveStep2WithoutValidation}
              disabled={productTypeWatch === 2 ? !isPartnerUpRegistrationEnabled : isSubmitting || nameOverLimit}
              className="h-12 w-full rounded-lg bg-orange-5 typo-body-small-bold text-neutral-2 disabled:opacity-50"
            >
              {productTypeWatch === 2 ? '등록요청' : '다음'}
            </button>
            <p className="mt-2 text-center typo-body-xsmall text-neutral-7">
              다음으로 넘어가도 현재 내용은 저장됩니다.
            </p>
          </div>
        </form>
        )}

        {currentStep === 2 && isBuyNow && (
          <form onSubmit={handleSubmitStep2BuyNow(onSubmitStep2BuyNow)} className="min-w-0 space-y-5">
            {/* 가격 */}
            <section>
              <label className="typo-body-small-bold text-neutral-10">
                가격<span className="text-red-5">*</span>
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  {...registerStep2BuyNow('price')}
                  className={cn(
                    'h-10 w-[163px] rounded-lg border bg-neutral-1 px-3 py-2 typo-body-xsmall text-neutral-12 placeholder:text-neutral-6',
                    errorsStep2BuyNow.price ? 'border-red-5' : 'border-neutral-5'
                  )}
                />
                <span className="typo-body-xsmall text-neutral-7">원</span>
              </div>
              {errorsStep2BuyNow.price && (
                <p className="mt-1 typo-body-xsmall text-red-5">{errorsStep2BuyNow.price.message}</p>
              )}
            </section>

            {/* 옵션 */}
            <section>
              <label className="typo-body-small-bold text-neutral-10">옵션</label>
              <p className="mt-1 typo-body-xsmall text-neutral-8">옵션 추가는 선택 사항입니다.</p>
              {buyNowOptions.map((opt, idx) => (
                <div
                  key={opt.id}
                  className="mt-3 rounded-lg border border-neutral-5 bg-neutral-1 p-3"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="typo-body-small-bold text-neutral-12">옵션 {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeBuyNowOption(opt.id)}
                      className="flex h-8 w-8 items-center justify-center rounded text-neutral-7 hover:bg-neutral-3"
                      aria-label="옵션 삭제"
                    >
                      <Image src="/assets/icons/filled/Filled/Close.svg" alt="" width={20} height={20} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <OptionName
                      className="w-full"
                      variant={
                        duplicateBuyNowOptionNames.has(opt.optionName.trim())
                          ? 'error'
                          : focusedBuyNowOptionNameId === opt.id
                            ? 'focus'
                            : opt.optionName.trim()
                              ? 'filled'
                              : 'Default'
                      }
                      value={opt.optionName}
                      inputProps={{
                        value: opt.optionName,
                        onChange: (e) => updateBuyNowOptionName(opt.id, e.target.value),
                        onFocus: () => setFocusedBuyNowOptionNameId(opt.id),
                        onBlur: () => setFocusedBuyNowOptionNameId((prev) => (prev === opt.id ? null : prev)),
                      }}
                    />
                    <div>
                      {opt.values.map((v) => (
                        <OptionVariation
                          key={v.id}
                          className="mt-1 w-full"
                          variant={
                            duplicateBuyNowOptionValuesByOptionId.get(opt.id)?.has(v.value.trim())
                              ? 'error'
                              : focusedBuyNowOptionValueId === v.id
                                ? 'focus'
                                : v.value.trim() || v.extraPrice > 0
                                  ? 'filled'
                                  : 'Default'
                          }
                          optionLabel={v.value}
                          extraPrice={v.extraPrice > 0 ? String(v.extraPrice) : ''}
                          optionInputProps={{
                            value: v.value,
                            onChange: (e) => updateBuyNowOptionValue(opt.id, v.id, 'value', e.target.value),
                            onFocus: () => setFocusedBuyNowOptionValueId(v.id),
                            onBlur: () => setFocusedBuyNowOptionValueId((prev) => (prev === v.id ? null : prev)),
                          }}
                          priceInputProps={{
                            type: 'number',
                            min: 0,
                            value: v.extraPrice > 0 ? String(v.extraPrice) : '',
                            onChange: (e) => updateBuyNowOptionValue(opt.id, v.id, 'extraPrice', e.target.value),
                          }}
                          onRemove={opt.values.length > 1 ? () => removeBuyNowOptionValue(opt.id, v.id) : undefined}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => addBuyNowOptionValue(opt.id)}
                        className="mt-2 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-5 bg-neutral-3 text-neutral-8 hover:bg-neutral-4"
                        aria-label="옵션값 추가"
                      >
                        <Image src="/assets/icons/light/plus.svg" alt="" width={16} height={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {buyNowOptions.length < MAX_OPTION_CARD_COUNT && (
                <button
                  type="button"
                  onClick={addBuyNowOption}
                  className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-[#e9ded2] typo-body-small-bold text-neutral-10"
                >
                  옵션 추가
                </button>
              )}
            </section>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={onBackToStep1}
                className="flex-1 h-12 rounded-lg border border-neutral-5 bg-neutral-1 typo-body-small-bold text-neutral-10"
              >
                이전
              </button>
              <button
                type="button"
                disabled={!isBuyNowRegistrationEnabled}
                onClick={() => {
                  setPendingRegistrationType('buyNow');
                  setShowRegistrationConfirmModal(true);
                }}
                className="flex-1 h-12 rounded-lg bg-orange-5 typo-body-small-bold text-neutral-2 disabled:opacity-60"
              >
                {isSubmittingRegistration ? '등록 중...' : '등록 요청'}
              </button>
            </div>
            {registrationError && (
              <p className="mt-2 text-center typo-body-xsmall text-red-5">{registrationError}</p>
            )}
            <p className="mt-2 text-center typo-body-xsmall text-neutral-8">
              등록 요청 시, 관리자 승인을 거친 뒤 상품글이 반영됩니다.
            </p>
          </form>
        )}

        {currentStep === 2 && isFundDelivery && (
          <form onSubmit={handleSubmitStep2Delivery(onSubmitStep2Delivery)} className="min-w-0 space-y-5">
            <section>
              <label className="typo-body-small-bold text-neutral-10">
                목표 금액 <span className="text-red-5">*</span>
              </label>
              <p className="mt-1 typo-body-xsmall text-neutral-8">
                목표 금액이 없다면 0으로 입력해 주세요.
              </p>
              <div
                className={cn(
                  'mt-1 flex h-10 w-[163px] items-center rounded-lg border bg-neutral-1 px-3 py-2',
                  errorsStep2Delivery.goalAmount ? 'border-red-5' : 'border-neutral-5 focus-within:border-orange-5'
                )}
              >
                <input
                  type="number"
                  {...registerStep2Delivery('goalAmount')}
                  placeholder="0"
                  min={0}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 typo-body-xsmall text-neutral-12 placeholder:text-neutral-6 outline-none"
                />
                <span className="ml-1 shrink-0 typo-body-xsmall text-neutral-7">원</span>
              </div>
              {errorsStep2Delivery.goalAmount && (
                <p className="mt-1 typo-body-xsmall text-red-5">{errorsStep2Delivery.goalAmount.message}</p>
              )}
            </section>

            <section>
              <label className="typo-body-small-bold text-neutral-12">
                생산 기간 <span className="text-orange-5">*</span>
              </label>
              <div className="date-range-field mt-1 flex min-w-0 flex-nowrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Controller
                    name="productionStartDate"
                    control={controlStep2Delivery}
                    render={({ field }) => (
                      <DatePicker
                        selected={productionStartDate}
                        onChange={(date: Date | null) => {
                          const value = date ? format(date, 'yyyy-MM-dd') : '';
                          field.onChange(value);
                          if (productionEndDate && date && productionEndDate < date) {
                            setValueStep2Delivery('productionEndDate', value);
                          }
                        }}
                        onBlur={field.onBlur}
                        minDate={today}
                        locale={ko}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="YYYY-MM-DD"
                        popperPlacement="bottom-start"
                        popperModifiers={[shift({ padding: 8 })]}
                        className={cn(
                          'h-12 w-full min-w-0 rounded-lg border bg-neutral-1 px-4 typo-body-small text-neutral-12',
                          errorsStep2Delivery.productionStartDate ? 'border-red-5' : 'border-neutral-5'
                        )}
                        calendarClassName="gcs-datepicker-calendar"
                      />
                    )}
                  />
                </div>
                <span className="shrink-0 typo-body-small-bold text-neutral-8">~</span>
                <div className="min-w-0 flex-1">
                  <Controller
                    name="productionEndDate"
                    control={controlStep2Delivery}
                    render={({ field }) => (
                      <DatePicker
                        selected={productionEndDate}
                        onChange={(date: Date | null) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                        onBlur={field.onBlur}
                        minDate={productionStartDate ?? today}
                        locale={ko}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="YYYY-MM-DD"
                        popperPlacement="bottom-start"
                        popperModifiers={[shift({ padding: 8 })]}
                        className={cn(
                          'h-12 w-full min-w-0 rounded-lg border bg-neutral-1 px-4 typo-body-small text-neutral-12',
                          errorsStep2Delivery.productionEndDate ? 'border-red-5' : 'border-neutral-5'
                        )}
                        calendarClassName="gcs-datepicker-calendar"
                      />
                    )}
                  />
                </div>
                <span className="shrink-0 typo-body-small-bold text-neutral-8">까지</span>
              </div>
              {(errorsStep2Delivery.productionStartDate || errorsStep2Delivery.productionEndDate) && (
                <p className="mt-1 typo-body-xsmall text-red-5">
                  {errorsStep2Delivery.productionStartDate?.message ??
                    errorsStep2Delivery.productionEndDate?.message}
                </p>
              )}
            </section>

            <section>
              <label className="typo-body-small-bold text-neutral-12">
                배송 기간 <span className="text-orange-5">*</span>
              </label>
              <div className="date-range-field mt-1 flex min-w-0 flex-nowrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Controller
                    name="deliveryStartDate"
                    control={controlStep2Delivery}
                    render={({ field }) => (
                      <DatePicker
                        selected={deliveryStartDate}
                        onChange={(date: Date | null) => {
                          const value = date ? format(date, 'yyyy-MM-dd') : '';
                          field.onChange(value);
                          if (deliveryEndDate && date && deliveryEndDate < date) {
                            setValueStep2Delivery('deliveryEndDate', value);
                          }
                        }}
                        onBlur={field.onBlur}
                        minDate={productionEndDate ?? today}
                        locale={ko}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="YYYY-MM-DD"
                        popperPlacement="bottom-start"
                        popperModifiers={[shift({ padding: 8 })]}
                        className={cn(
                          'h-12 w-full min-w-0 rounded-lg border bg-neutral-1 px-4 typo-body-small text-neutral-12',
                          errorsStep2Delivery.deliveryStartDate ? 'border-red-5' : 'border-neutral-5'
                        )}
                        calendarClassName="gcs-datepicker-calendar"
                      />
                    )}
                  />
                </div>
                <span className="shrink-0 typo-body-small-bold text-neutral-8">~</span>
                <div className="min-w-0 flex-1">
                  <Controller
                    name="deliveryEndDate"
                    control={controlStep2Delivery}
                    render={({ field }) => (
                      <DatePicker
                        selected={deliveryEndDate}
                        onChange={(date: Date | null) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                        onBlur={field.onBlur}
                        minDate={deliveryStartDate ?? productionEndDate ?? today}
                        locale={ko}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="YYYY-MM-DD"
                        popperPlacement="bottom-start"
                        popperModifiers={[shift({ padding: 8 })]}
                        className={cn(
                          'h-12 w-full min-w-0 rounded-lg border bg-neutral-1 px-4 typo-body-small text-neutral-12',
                          errorsStep2Delivery.deliveryEndDate ? 'border-red-5' : 'border-neutral-5'
                        )}
                        calendarClassName="gcs-datepicker-calendar"
                      />
                    )}
                  />
                </div>
                <span className="shrink-0 typo-body-small-bold text-neutral-8">까지</span>
              </div>
              {(errorsStep2Delivery.deliveryStartDate || errorsStep2Delivery.deliveryEndDate) && (
                <p className="mt-1 typo-body-xsmall text-red-5">
                  {errorsStep2Delivery.deliveryStartDate?.message ??
                    errorsStep2Delivery.deliveryEndDate?.message}
                </p>
              )}
            </section>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={onBackToStep1}
                className="flex-1 h-12 rounded-lg border border-neutral-5 bg-neutral-1 typo-body-small-bold text-neutral-10"
              >
                이전
              </button>
              <button
                type="button"
                onClick={onMoveStep3WithoutValidation}
                className="flex-1 h-12 rounded-lg bg-orange-5 typo-body-small-bold text-neutral-2 disabled:opacity-50"
              >
                다음
              </button>
            </div>
            <p className="mt-2 text-center typo-body-xsmall text-neutral-7">
              다음으로 넘어가도 현재 내용은 저장됩니다.
            </p>
          </form>
        )}

        {currentStep === 2 && isFundPickup && (
          <form onSubmit={handleSubmitStep2Pickup(onSubmitStep2Pickup)} className="min-w-0 space-y-5">
            <section>
              <label className="typo-body-small-bold text-neutral-10">
                예상 수령 기간 <span className="text-red-5">*</span>
              </label>
              <p className="mt-1 typo-body-xsmall text-neutral-8">
                목표 금액이 없다면 0으로 입력해 주세요.
              </p>
              <div
                className={cn(
                  'mt-1 flex h-10 w-[163px] items-center rounded-lg border bg-neutral-1 px-3 py-2',
                  errorsStep2Pickup.goalAmount ? 'border-red-5' : 'border-neutral-5 focus-within:border-orange-5'
                )}
              >
                <input
                  type="number"
                  {...registerStep2Pickup('goalAmount')}
                  placeholder="0"
                  min={0}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 typo-body-xsmall text-neutral-12 placeholder:text-neutral-6 outline-none"
                />
                <span className="ml-1 shrink-0 typo-body-xsmall text-neutral-7">원</span>
              </div>
              {errorsStep2Pickup.goalAmount && (
                <p className="mt-1 typo-body-xsmall text-red-5">{errorsStep2Pickup.goalAmount.message}</p>
              )}
            </section>

            <section>
              <label className="typo-body-small-bold text-neutral-10">
                수령 기간 <span className="text-red-5">*</span>
              </label>
              <div className="date-range-field mt-1 flex min-w-0 flex-nowrap items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="typo-body-xsmall text-neutral-8">기간 시작일</p>
                  <Controller
                    name="pickupStartDate"
                    control={controlStep2Pickup}
                    render={({ field }) => (
                      <DatePicker
                        selected={pickupStartDate}
                        onChange={(date: Date | null) => {
                          const value = date ? format(date, 'yyyy-MM-dd') : '';
                          field.onChange(value);
                          if (pickupEndDate && date && pickupEndDate < date) {
                            setValueStep2Pickup('pickupEndDate', value);
                          }
                        }}
                        onBlur={field.onBlur}
                        minDate={today}
                        locale={ko}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="YYYY-MM-DD"
                        popperPlacement="bottom-start"
                        popperModifiers={[shift({ padding: 8 })]}
                        className={cn(
                          'h-10 w-full min-w-0 rounded-lg border bg-neutral-1 px-3 py-2 typo-body-xsmall text-neutral-12',
                          errorsStep2Pickup.pickupStartDate ? 'border-red-5' : 'border-neutral-5'
                        )}
                        calendarClassName="gcs-datepicker-calendar"
                      />
                    )}
                  />
                </div>
                <span className="shrink-0 pt-6 typo-body-small-bold text-neutral-12">~</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="typo-body-xsmall text-neutral-8">기간 종료일</p>
                  <Controller
                    name="pickupEndDate"
                    control={controlStep2Pickup}
                    render={({ field }) => (
                      <DatePicker
                        selected={pickupEndDate}
                        onChange={(date: Date | null) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                        onBlur={field.onBlur}
                        minDate={pickupStartDate ?? today}
                        locale={ko}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="YYYY-MM-DD"
                        popperPlacement="bottom-start"
                        popperModifiers={[shift({ padding: 8 })]}
                        className={cn(
                          'h-10 w-full min-w-0 rounded-lg border bg-neutral-1 px-3 py-2 typo-body-xsmall text-neutral-12',
                          errorsStep2Pickup.pickupEndDate ? 'border-red-5' : 'border-neutral-5'
                        )}
                        calendarClassName="gcs-datepicker-calendar"
                      />
                    )}
                  />
                </div>
                <span className="shrink-0 pt-6 typo-body-small-bold text-neutral-12">까지</span>
              </div>
              {(errorsStep2Pickup.pickupStartDate || errorsStep2Pickup.pickupEndDate) && (
                <p className="mt-1 typo-body-xsmall text-red-5">
                  {errorsStep2Pickup.pickupStartDate?.message ?? errorsStep2Pickup.pickupEndDate?.message}
                </p>
              )}
            </section>

            <section>
              <label className="typo-body-small-bold text-neutral-10">
                수령 장소 <span className="text-red-5">*</span>
              </label>
              <p className="mt-1 typo-body-xsmall text-neutral-8">
                미정인 경우, &quot;추후 안내&quot;로 입력해 주세요.
              </p>
              <input
                {...registerStep2Pickup('pickupLocation')}
                placeholder="수령 장소를 입력해 주세요"
                className={cn(
                  'mt-1 h-10 w-full rounded-lg border bg-neutral-1 px-3 py-2 typo-body-xsmall text-neutral-12 placeholder:text-neutral-6',
                  errorsStep2Pickup.pickupLocation ? 'border-red-5' : 'border-neutral-5'
                )}
              />
              {errorsStep2Pickup.pickupLocation && (
                <p className="mt-1 typo-body-xsmall text-red-5">{errorsStep2Pickup.pickupLocation.message}</p>
              )}
            </section>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={onBackToStep1}
                className="flex-1 h-12 rounded-lg bg-[#e9ded2] typo-body-small-bold text-neutral-12"
              >
                이전
              </button>
              <button
                type="button"
                onClick={onMoveStep3WithoutValidation}
                className="flex-1 h-12 rounded-lg bg-orange-5 typo-body-small-bold text-neutral-2 disabled:opacity-50"
              >
                다음
              </button>
            </div>
            <p className="mt-2 text-center typo-body-xsmall text-neutral-8">
              다음으로 넘어가도 현재 내용은 저장됩니다.
            </p>
          </form>
        )}

        {currentStep === 3 && productType === 0 && (
          <form onSubmit={handleSubmitStep3Fund(onSubmitStep3Fund)} className="min-w-0 space-y-5">
            <section>
              <label className="typo-body-small-bold text-neutral-10">
                가격<span className="text-red-5">*</span>
              </label>
              <div
                className={cn(
                  'mt-1 flex h-10 w-[163px] items-center rounded-lg border bg-neutral-1 px-3 py-2',
                  errorsStep3Fund.price ? 'border-red-5' : 'border-neutral-5 focus-within:border-orange-5'
                )}
              >
                <input
                  type="number"
                  {...registerStep3Fund('price')}
                  placeholder="0"
                  min={0}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 typo-body-xsmall text-neutral-12 placeholder:text-neutral-6 outline-none"
                />
                <span className="ml-1 shrink-0 typo-body-xsmall text-neutral-7">원</span>
              </div>
              {errorsStep3Fund.price && (
                <p className="mt-1 typo-body-xsmall text-red-5">{errorsStep3Fund.price.message}</p>
              )}
            </section>

            <section>
              <label className="typo-body-small-bold text-neutral-10">옵션</label>
              <p className="mt-1 typo-body-xsmall text-neutral-8">옵션 추가는 선택 사항입니다.</p>
              {fundStep3Options.map((opt, idx) => (
                <div key={opt.id} className="mt-3 rounded-lg border border-neutral-5 bg-neutral-1 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="typo-body-small-bold text-neutral-12">옵션 {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeFundStep3Option(opt.id)}
                      className="flex h-8 w-8 items-center justify-center rounded text-neutral-7 hover:bg-neutral-3"
                      aria-label="옵션 삭제"
                    >
                      <Image src="/assets/icons/filled/Filled/Close.svg" alt="" width={20} height={20} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <OptionName
                      className="w-full"
                      variant={
                        duplicateFundOptionNames.has(opt.optionName.trim())
                          ? 'error'
                          : focusedFundOptionNameId === opt.id
                            ? 'focus'
                            : opt.optionName.trim()
                              ? 'filled'
                              : 'Default'
                      }
                      value={opt.optionName}
                      inputProps={{
                        value: opt.optionName,
                        onChange: (e) => updateFundStep3OptionName(opt.id, e.target.value),
                        onFocus: () => setFocusedFundOptionNameId(opt.id),
                        onBlur: () => setFocusedFundOptionNameId((prev) => (prev === opt.id ? null : prev)),
                      }}
                    />
                    <div>
                      {opt.values.map((v) => (
                        <OptionVariation
                          key={v.id}
                          className="mt-1 w-full"
                          variant={
                            duplicateFundOptionValuesByOptionId.get(opt.id)?.has(v.value.trim())
                              ? 'error'
                              : focusedFundOptionValueId === v.id
                                ? 'focus'
                                : v.value.trim() || v.extraPrice > 0
                                  ? 'filled'
                                  : 'Default'
                          }
                          optionLabel={v.value}
                          extraPrice={v.extraPrice > 0 ? String(v.extraPrice) : ''}
                          optionInputProps={{
                            value: v.value,
                            onChange: (e) => updateFundStep3OptionValue(opt.id, v.id, 'value', e.target.value),
                            onFocus: () => setFocusedFundOptionValueId(v.id),
                            onBlur: () => setFocusedFundOptionValueId((prev) => (prev === v.id ? null : prev)),
                          }}
                          priceInputProps={{
                            type: 'number',
                            min: 0,
                            value: v.extraPrice > 0 ? String(v.extraPrice) : '',
                            onChange: (e) => updateFundStep3OptionValue(opt.id, v.id, 'extraPrice', e.target.value),
                          }}
                          onRemove={opt.values.length > 1 ? () => removeFundStep3OptionValue(opt.id, v.id) : undefined}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => addFundStep3OptionValue(opt.id)}
                        className="mt-2 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-5 bg-neutral-3 text-neutral-8 hover:bg-neutral-4"
                        aria-label="옵션값 추가"
                      >
                        <Image src="/assets/icons/light/plus.svg" alt="" width={16} height={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {fundStep3Options.length < MAX_OPTION_CARD_COUNT && (
                <button
                  type="button"
                  onClick={addFundStep3Option}
                  className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-[#e9ded2] typo-body-small-bold text-neutral-10"
                >
                  옵션 추가
                </button>
              )}
            </section>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="flex-1 h-12 rounded-lg bg-[#e9ded2] typo-body-small-bold text-neutral-12"
              >
                이전
              </button>
              <button
                type="button"
                disabled={!isFundRegistrationEnabled}
                onClick={() => {
                  setPendingRegistrationType('fund');
                  setShowRegistrationConfirmModal(true);
                }}
                className="flex-1 h-12 rounded-lg bg-orange-5 typo-body-small-bold text-neutral-2 disabled:opacity-60"
              >
                {isSubmittingRegistration ? '등록 중...' : '등록 요청'}
              </button>
            </div>
            {registrationError && (
              <p className="mt-2 text-center typo-body-xsmall text-red-5">{registrationError}</p>
            )}
            <p className="mt-2 text-center typo-body-xsmall text-neutral-8">
              등록 요청 시, 관리자 승인을 거친 뒤 상품글이 반영됩니다.
            </p>
          </form>
        )}

        {/* 등록 요청 확인 모달 */}
        {showRegistrationConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <button
              type="button"
              aria-label="모달 닫기"
              className="absolute inset-0 bg-neutral-12 opacity-70"
              onClick={() => {
                setShowRegistrationConfirmModal(false);
                setPendingRegistrationType(null);
              }}
            />
            <div className="relative z-10 w-full max-w-[287px] rounded-xl bg-neutral-1 px-7 pb-6 pt-10 shadow-lg">
              <p className="text-center text-[15px] font-bold leading-[1.5] text-neutral-12">
                관리자에게 상품글 등록을 요청하시겠습니까?
              </p>
              <p className="mt-2 text-center typo-body-xsmall text-neutral-8">
                관리자 확인 후 상품이 게시됩니다.
              </p>
              <div className="mt-8 flex gap-[14px]">
                <button
                  type="button"
                  onClick={() => {
                    setShowRegistrationConfirmModal(false);
                    setPendingRegistrationType(null);
                  }}
                  className="flex-1 rounded-lg border border-neutral-5 bg-neutral-2 py-3 typo-body-small-bold text-neutral-10"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingRegistrationType === 'buyNow') {
                      onSubmitStep2BuyNow(step2BuyNowForm.getValues());
                    } else if (pendingRegistrationType === 'fund') {
                      onSubmitStep3Fund(step3FundForm.getValues());
                    }
                    setShowRegistrationConfirmModal(false);
                    setPendingRegistrationType(null);
                  }}
                  className="flex-1 rounded-lg bg-orange-5 py-3 typo-body-small-bold text-neutral-2"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}





