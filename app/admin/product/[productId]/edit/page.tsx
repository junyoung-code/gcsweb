'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { NavBar } from '@/components/layout';
import StepProgress, { type StepProgressStatus } from '@/components/ui/admin/product/StepProgress';
import TextField from '@/components/ui/common/TextField';
import Modal from '@/components/ui/common/Modal';
import Radiocardgroup from '@/components/ui/admin/product/Radiocardgroup';
import DateRangeInput from '@/components/ui/admin/product/DateRangeInput';
import ProductImage from '@/components/ui/admin/product/Image';
import OptionName from '@/components/ui/admin/product/OptionName';
import OptionVariation from '@/components/ui/admin/product/OptionVariation';
import { PRODUCT_TYPE_OPTIONS, isDisabledProductType } from '@/lib/product-type';

type ProductType = 0 | 1 | 2;
type ReceiveMethod = 0 | 1 | null;
type Step = 1 | 2 | 3;

type OptionItem = {
  id: string;
  optionName: string;
  values: Array<{ id: string; value: string; extraPrice: number }>;
};

type ProductDraftComparable = {
  teamId: string;
  name: string;
  description: string;
  type: ProductType;
  receiveMethod: ReceiveMethod;
  salesStartDate: string;
  salesEndDate: string;
  thumbnailUrl: string;
  detailImageUrls: string[];
  noticeImgUrl: string;
  price: number;
  goalAmount: number | null;
  productionStartDate: string | null;
  productionEndDate: string | null;
  deliveryStartDate: string | null;
  deliveryEndDate: string | null;
  pickupStartDate: string | null;
  pickupEndDate: string | null;
  pickupLocation: string | null;
  options: Array<{
    name: string;
    values: Array<{ value: string; additionalPrice: number }>;
  }>;
};

type ProductDetailResponse = {
  status: 'success' | 'error';
  code?: string;
  message?: string;
  data?: {
    product?: {
      id: string;
      teamId: string;
      teamName: string;
      name: string;
      description: string;
      type: ProductType;
      receiveMethod: ReceiveMethod;
      salesStartDate: string;
      salesEndDate: string;
      images: {
        thumbnailUrl: string;
        detailImageUrls: string[];
        noticeImgUrl: string;
      };
      goalAmount: number | null;
      productionStartDate: string | null;
      productionEndDate: string | null;
      deliveryStartDate: string | null;
      deliveryEndDate: string | null;
      pickupStartDate: string | null;
      pickupEndDate: string | null;
      pickupLocation: string | null;
      price: number;
      options: Array<{ name: string; values: Array<{ value: string; additionalPrice: number }> }>;
      updatedAt: string;
    };
  };
};

const DETAIL_IMAGE_MAX = 10;

const KR = {
  previous: '\uC774\uC804',
  next: '\uB2E4\uC74C',
  won: '\uC6D0',
  imageUploadFail: '\uC774\uBBF8\uC9C0 \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  invalidProductId: '\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC0C1\uD488 ID\uC785\uB2C8\uB2E4.',
  fetchProductFail: '\uC0C1\uD488 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
  optionNameDuplicate: '\uC635\uC158\uBA85\uC740 \uC911\uBCF5\uB420 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  optionValueRequired: '\uC635\uC158\uAC12\uC740 \uBE44\uC6CC\uB458 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  optionValueDuplicate: '\uAC19\uC740 \uC635\uC158 \uB0B4 \uC635\uC158\uAC12\uC740 \uC911\uBCF5\uB420 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
  optionPriceInvalid: '\uCD94\uAC00\uAE08\uC561\uC740 0 \uC774\uC0C1 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.',
  thumbnailUploadFail: '\uC378\uB124\uC77C \uC774\uBBF8\uC9C0 \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  detailUploadFail: '\uC0C1\uC138 \uC774\uBBF8\uC9C0 \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  noticeUploadFail: '\uC0C1\uD488 \uC815\uBCF4 \uACE0\uC2DC \uC774\uBBF8\uC9C0 \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  dateInvalid: '\uB0A0\uC9DC \uD615\uC2DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.',
  conflict: '\uC774\uBBF8 \uB2E4\uB978 \uBCC0\uACBD\uC0AC\uD56D\uC774 \uBC18\uC601\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.',
  updateFail: '\uC0C1\uD488 \uC218\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  editProduct: '\uC0C1\uD488 \uC218\uC815',
  salesTeam: '\uD310\uB9E4\uD300',
  productName: '\uC0C1\uD488\uBA85',
  productDesc: '\uC0C1\uD488 \uC124\uBA85',
  productType: '\uC0C1\uD488 \uC720\uD615',
  parcel: '\uD0DD\uBC30 \uBC30\uC1A1',
  pickup: '\uD604\uC7A5 \uC218\uB839',
  salesPeriod: '\uD310\uB9E4 \uAE30\uAC04',
  salesStart: '\uD310\uB9E4 \uC2DC\uC791\uC77C',
  salesEnd: '\uD310\uB9E4 \uC885\uB8CC\uC77C',
  thumbnailImage: '\uC378\uB124\uC77C \uC774\uBBF8\uC9C0',
  thumbnailImageHelp: '\uC378\uB124\uC77C \uC774\uBBF8\uC9C0\uB294 1\uC7A5\uB9CC \uC5C5\uB85C\uB4DC\uD569\uB2C8\uB2E4.',
  detailImage: '\uC0C1\uC138\uD398\uC774\uC9C0 \uC774\uBBF8\uC9C0',
  detailImageHelp: '\uC5EC\uB7EC \uC7A5\uC778 \uACBD\uC6B0, \uD654\uBA74\uC5D0 \uB178\uCD9C\uB420 \uC21C\uC11C\uB300\uB85C \uC5C5\uB85C\uB4DC\uD574 \uC8FC\uC138\uC694.',
  noticeImage: '\uC0C1\uD488 \uC815\uBCF4 \uACE0\uC2DC \uC774\uBBF8\uC9C0',
  noticeImageHelp: '\uC0C1\uD488 \uC815\uBCF4 \uACE0\uC2DC \uC774\uBBF8\uC9C0\uB294 1\uC7A5\uB9CC \uC5C5\uB85C\uB4DC\uD569\uB2C8\uB2E4.',
  uploading: '\uC5C5\uB85C\uB4DC \uC911...',
  goalAmount: '\uBAA9\uD45C \uAE08\uC561',
  goalAmountHelp: '\uBAA9\uD45C \uAE08\uC561\uC774 \uC5C6\uB2E4\uBA74 0\uC6D0\uC73C\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.',
  productionPeriod: '\uC81C\uC791 \uAE30\uAC04',
  productionStart: '\uC81C\uC791 \uC2DC\uC791\uC77C',
  productionEnd: '\uC81C\uC791 \uC885\uB8CC\uC77C',
  deliveryPeriod: '\uBC30\uC1A1 \uAE30\uAC04',
  deliveryStart: '\uBC30\uC1A1 \uC2DC\uC791\uC77C',
  deliveryEnd: '\uBC30\uC1A1 \uC885\uB8CC\uC77C',
  pickupPeriod: '\uC218\uB839 \uAE30\uAC04',
  pickupStart: '\uC218\uB839 \uC2DC\uC791\uC77C',
  pickupEnd: '\uC218\uB839 \uC885\uB8CC\uC77C',
  pickupLocation: '\uC218\uB839 \uC7A5\uC18C',
  pickupLocationSubtext: '\uBBF8\uC815\uC778 \uACBD\uC6B0, \uCD94\uD6C4 \uC548\uB0B4\uBB38\uAD6C\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.',
  pickupLocationPlaceholder: '\uC608) \uB3D9\uAD6D\uB300\uD559\uAD50 \uD559\uC220\uAD00 K127',
  option: '\uC635\uC158',
  optionName: '\uC635\uC158\uBA85',
  optionValue: '\uC635\uC158\uAC12',
  additionalPrice: '\uCD94\uAC00 \uAE08\uC561',
  optionNamePlaceholder: '\uC608) \uD504\uB9B0\uD305',
  optionValuePlaceholder: '\uC608) BLACK',
  optionOptionalHelp: '\uC635\uC158 \uCD94\uAC00\uB294 \uC120\uD0DD \uC0AC\uD56D\uC785\uB2C8\uB2E4.',
  optionAdd: '\uC635\uC158 \uCD94\uAC00',
  edit: '\uC218\uC815',
  cancel: '\uCDE8\uC18C',
  confirm: '\uD655\uC778',
  editing: '\uC218\uC815 \uC911...',
  editModalTitle: '\uC0C1\uD488\uAE00\uC744 \uC218\uC815\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?',
};

function digitsOnly(value: string) {
  return value.replace(/[^\d]/g, '');
}

function formatNumber(value: string) {
  const digits = digitsOnly(value);
  if (!digits) return '';
  return Number(digits).toLocaleString('ko-KR');
}

function normalizeOptions(options: OptionItem[]): ProductDraftComparable['options'] {
  return options
    .map((o) => ({
      name: o.optionName.trim(),
      values: o.values
        .map((v) => ({
          value: v.value.trim(),
          additionalPrice: Number.isFinite(v.extraPrice) ? Math.max(0, Math.trunc(v.extraPrice)) : 0,
        }))
        .filter((v) => v.value.length > 0),
    }))
    .filter((o) => o.name.length > 0);
}

function toDateInput(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

function toIso(value: string, endOfDay = false) {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return `${v}T${endOfDay ? '23:59:59.000' : '00:00:00.000'}+09:00`;
}

async function uploadProductImage(file: File, usage: 'PRODUCT_THUMBNAIL' | 'PRODUCT_DETAIL' | 'PRODUCT_NOTICE') {
  const form = new FormData();
  form.append('image', file);
  form.append('usage', usage);

  const res = await fetch('/api/v1/images', { method: 'POST', body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.status !== 'success' || !json?.data?.imageUrl) {
    throw new Error(json?.message ?? KR.imageUploadFail);
  }
  return String(json.data.imageUrl);
}

function ArrowButton({
  direction,
  onClick,
  disabled = false,
}: {
  direction: 'left' | 'right';
  onClick: () => void;
  disabled?: boolean;
}) {
  const iconColorClass = disabled ? 'text-neutral-6' : 'text-neutral-10';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[55px] w-[37px] items-center justify-center rounded-[8px] bg-[#e9ded2] disabled:cursor-not-allowed"
      aria-label={direction === 'left' ? KR.previous : KR.next}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconColorClass} ${direction === 'left' ? 'rotate-180' : ''}`}
        aria-hidden
      >
        <path
          d="M9 19L14.3306 12.7809C14.7158 12.3316 14.7158 11.6684 14.3306 11.2191L9 5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function PriceField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const isFilled = value > 0;
  return (
    <div className="flex h-10 w-[163px] items-center rounded-[8px] border border-neutral-4 bg-neutral-2 px-[13px] py-[10px]">
      <div className="flex h-5 w-[137px] items-center border-b border-neutral-5">
        <input
          value={value > 0 ? formatNumber(String(value)) : ''}
          onChange={(e) => onChange(Math.max(0, Number(digitsOnly(e.target.value) || 0)))}
          placeholder="0"
          inputMode="numeric"
          className={`w-[125px] bg-transparent typo-body-xsmall outline-none placeholder:text-neutral-7 ${isFilled ? 'text-black' : 'text-neutral-7'}`}
        />
        <span className="w-[12px] text-right typo-body-xsmall text-neutral-7">{KR.won}</span>
      </div>
    </div>
  );
}

function CloseIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5.5 5.5L14.5 14.5M14.5 5.5L5.5 14.5" stroke="#999694" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusPillIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="6" fill="#A9A6A3" />
      <path d="M12 8V16M8 12H16" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default function AdminProductEditPage() {
  const router = useRouter();
  const params = useParams<{ productId: string }>();
  const productId = useMemo(() => (typeof params?.productId === 'string' ? params.productId.trim() : ''), [params]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [teamId, setTeamId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ProductType>(0);
  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>(0);
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesEndDate, setSalesEndDate] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [detailImageUrls, setDetailImageUrls] = useState<string[]>([]);
  const [noticeImgUrl, setNoticeImgUrl] = useState('');

  const [goalAmount, setGoalAmount] = useState(0);
  const [productionStartDate, setProductionStartDate] = useState('');
  const [productionEndDate, setProductionEndDate] = useState('');
  const [deliveryStartDate, setDeliveryStartDate] = useState('');
  const [deliveryEndDate, setDeliveryEndDate] = useState('');
  const [pickupStartDate, setPickupStartDate] = useState('');
  const [pickupEndDate, setPickupEndDate] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');

  const [price, setPrice] = useState(0);
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [uploading, setUploading] = useState({ thumbnail: false, detail: false, notice: false });
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [focusedOptionNameId, setFocusedOptionNameId] = useState<string | null>(null);
  const [focusedOptionValueId, setFocusedOptionValueId] = useState<string | null>(null);

  const thumbInputRef = useRef<HTMLInputElement | null>(null);
  const detailInputRef = useRef<HTMLInputElement | null>(null);
  const noticeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInitialSnapshot(null);

    (async () => {
      if (!productId) {
        setErrorMessage(KR.invalidProductId);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/v1/admin/product/update/${productId}`, { cache: 'no-store' });
        const json = (await res.json().catch(() => ({}))) as ProductDetailResponse;
        if (!res.ok || json.status !== 'success' || !json.data?.product) {
          throw new Error(json.message ?? KR.fetchProductFail);
        }

        if (cancelled) return;
        const p = json.data.product;
        const initialComparable: ProductDraftComparable = {
          teamId: p.teamId,
          name: p.name.trim(),
          description: p.description.trim(),
          type: p.type,
          receiveMethod: p.receiveMethod,
          salesStartDate: toDateInput(p.salesStartDate),
          salesEndDate: toDateInput(p.salesEndDate),
          thumbnailUrl: p.images.thumbnailUrl || '',
          detailImageUrls: Array.isArray(p.images.detailImageUrls) ? p.images.detailImageUrls : [],
          noticeImgUrl: p.images.noticeImgUrl || '',
          price: p.price ?? 0,
          goalAmount: p.type === 0 ? (p.goalAmount ?? 0) : null,
          productionStartDate: p.type === 0 && p.receiveMethod === 0 ? toDateInput(p.productionStartDate) : null,
          productionEndDate: p.type === 0 && p.receiveMethod === 0 ? toDateInput(p.productionEndDate) : null,
          deliveryStartDate: p.type === 0 && p.receiveMethod === 0 ? toDateInput(p.deliveryStartDate) : null,
          deliveryEndDate: p.type === 0 && p.receiveMethod === 0 ? toDateInput(p.deliveryEndDate) : null,
          pickupStartDate: p.type === 0 && p.receiveMethod === 1 ? toDateInput(p.pickupStartDate) : null,
          pickupEndDate: p.type === 0 && p.receiveMethod === 1 ? toDateInput(p.pickupEndDate) : null,
          pickupLocation: p.type === 0 && p.receiveMethod === 1 ? (p.pickupLocation ?? '') : null,
          options: (p.options ?? []).map((opt) => ({
            name: opt.name.trim(),
            values: (opt.values ?? []).map((v) => ({
              value: v.value.trim(),
              additionalPrice: Number(v.additionalPrice ?? 0),
            })),
          })),
        };

        setTeamId(p.teamId);
        setTeamName(p.teamName);
        setUpdatedAt(p.updatedAt);
        setName(p.name);
        setDescription(p.description);
        setType(p.type);
        setReceiveMethod(p.receiveMethod);
        setSalesStartDate(toDateInput(p.salesStartDate));
        setSalesEndDate(toDateInput(p.salesEndDate));
        setThumbnailUrl(p.images.thumbnailUrl || '');
        setDetailImageUrls(Array.isArray(p.images.detailImageUrls) ? p.images.detailImageUrls : []);
        setNoticeImgUrl(p.images.noticeImgUrl || '');
        setGoalAmount(p.goalAmount ?? 0);
        setProductionStartDate(toDateInput(p.productionStartDate));
        setProductionEndDate(toDateInput(p.productionEndDate));
        setDeliveryStartDate(toDateInput(p.deliveryStartDate));
        setDeliveryEndDate(toDateInput(p.deliveryEndDate));
        setPickupStartDate(toDateInput(p.pickupStartDate));
        setPickupEndDate(toDateInput(p.pickupEndDate));
        setPickupLocation(p.pickupLocation ?? '');
        setPrice(p.price ?? 0);
        setOptions(
          (p.options ?? []).map((opt, oi) => ({
            id: `opt-${oi}-${Date.now()}`,
            optionName: opt.name,
            values: (opt.values ?? []).map((v, vi) => ({
              id: `opt-${oi}-val-${vi}-${Date.now()}`,
              value: v.value,
              extraPrice: v.additionalPrice,
            })),
          }))
        );
        setInitialSnapshot(JSON.stringify(initialComparable));
        setErrorMessage(null);
      } catch (error: any) {
        if (!cancelled) setErrorMessage(error?.message ?? KR.fetchProductFail);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  const isStep1Complete = useMemo(() => {
    const common =
      teamId.trim() &&
      name.trim() &&
      description.trim() &&
      salesStartDate.trim() &&
      salesEndDate.trim() &&
      thumbnailUrl.trim() &&
      detailImageUrls.length > 0 &&
      noticeImgUrl.trim();

    if (!common) return false;
    if (type === 0) return receiveMethod === 0 || receiveMethod === 1;
    if (type === 1) return receiveMethod === 1;
    return receiveMethod === null;
  }, [teamId, name, description, salesStartDate, salesEndDate, thumbnailUrl, detailImageUrls.length, noticeImgUrl, type, receiveMethod]);

  const isStep2Complete = useMemo(() => {
    if (type !== 0) return true;
    if (goalAmount < 0) return false;
    if (receiveMethod === 0) return productionStartDate && productionEndDate && deliveryStartDate && deliveryEndDate;
    if (receiveMethod === 1) return pickupStartDate && pickupEndDate && pickupLocation.trim();
    return false;
  }, [type, receiveMethod, goalAmount, productionStartDate, productionEndDate, deliveryStartDate, deliveryEndDate, pickupStartDate, pickupEndDate, pickupLocation]);

  const currentComparable = useMemo<ProductDraftComparable>(
    () => ({
      teamId: teamId.trim(),
      name: name.trim(),
      description: description.trim(),
      type,
      receiveMethod,
      salesStartDate: salesStartDate.trim(),
      salesEndDate: salesEndDate.trim(),
      thumbnailUrl: thumbnailUrl.trim(),
      detailImageUrls,
      noticeImgUrl: noticeImgUrl.trim(),
      price: Number.isFinite(price) ? Math.max(0, Math.trunc(price)) : 0,
      goalAmount: type === 0 ? Math.max(0, Math.trunc(goalAmount)) : null,
      productionStartDate: type === 0 && receiveMethod === 0 ? productionStartDate.trim() : null,
      productionEndDate: type === 0 && receiveMethod === 0 ? productionEndDate.trim() : null,
      deliveryStartDate: type === 0 && receiveMethod === 0 ? deliveryStartDate.trim() : null,
      deliveryEndDate: type === 0 && receiveMethod === 0 ? deliveryEndDate.trim() : null,
      pickupStartDate: type === 0 && receiveMethod === 1 ? pickupStartDate.trim() : null,
      pickupEndDate: type === 0 && receiveMethod === 1 ? pickupEndDate.trim() : null,
      pickupLocation: type === 0 && receiveMethod === 1 ? pickupLocation.trim() : null,
      options: normalizeOptions(options),
    }),
    [
      teamId,
      name,
      description,
      type,
      receiveMethod,
      salesStartDate,
      salesEndDate,
      thumbnailUrl,
      detailImageUrls,
      noticeImgUrl,
      price,
      goalAmount,
      productionStartDate,
      productionEndDate,
      deliveryStartDate,
      deliveryEndDate,
      pickupStartDate,
      pickupEndDate,
      pickupLocation,
      options,
    ]
  );

  const hasChanges = useMemo(() => {
    if (!initialSnapshot) return false;
    return JSON.stringify(currentComparable) !== initialSnapshot;
  }, [currentComparable, initialSnapshot]);

  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);

  const duplicateOptionNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const option of options) {
      const key = option.optionName.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [options]);

  const duplicateOptionValuesByOptionId = useMemo(() => {
    const duplicates = new Map<string, Set<string>>();
    for (const option of options) {
      const counts = new Map<string, number>();
      for (const value of option.values) {
        const key = value.value.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const dupSet = new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
      duplicates.set(option.id, dupSet);
    }
    return duplicates;
  }, [options]);

  const optionValidationError = useMemo(() => {
    const optionNames = new Set<string>();
    for (const option of normalizedOptions) {
      const optionName = option.name.trim();
      if (optionNames.has(optionName)) return KR.optionNameDuplicate;
      optionNames.add(optionName);

      const values = new Set<string>();
      for (const item of option.values) {
        if (values.has(item.value)) return KR.optionValueDuplicate;
        values.add(item.value);
        if (!Number.isInteger(item.additionalPrice) || item.additionalPrice < 0) return KR.optionPriceInvalid;
      }
    }
    return null;
  }, [normalizedOptions]);

  const canSubmit = useMemo(() => {
    const hasRequiredInputs = isStep1Complete && isStep2Complete && !optionValidationError;
    return hasChanges && hasRequiredInputs && !isSubmitting && !uploading.thumbnail && !uploading.detail && !uploading.notice;
  }, [hasChanges, isStep1Complete, isStep2Complete, optionValidationError, isSubmitting, uploading.thumbnail, uploading.detail, uploading.notice]);

  const progress: [StepProgressStatus, StepProgressStatus, StepProgressStatus] = useMemo(() => {
    if (currentStep === 1) return ['current', 'upcoming', 'upcoming'];
    if (currentStep === 2) return [isStep1Complete ? 'complete' : 'current', 'current', 'upcoming'];
    return [isStep1Complete ? 'complete' : 'current', type === 0 ? (isStep2Complete ? 'complete' : 'current') : 'skipped', 'current'];
  }, [currentStep, isStep1Complete, isStep2Complete, type]);

  const onTypeSelect = (index: number) => {
    const nextType: ProductType = index === 0 ? 0 : index === 1 ? 1 : 2;
    setType(nextType);

    if (nextType === 1) {
      setReceiveMethod(1);
    } else if (nextType === 2) {
      setReceiveMethod(null);
    } else if (receiveMethod === null) {
      setReceiveMethod(0);
    }

    if (nextType !== 0) {
      setGoalAmount(0);
      setProductionStartDate('');
      setProductionEndDate('');
      setDeliveryStartDate('');
      setDeliveryEndDate('');
      setPickupStartDate('');
      setPickupEndDate('');
      setPickupLocation('');
    }
  };

  const onReceiveMethodSelect = (index: number) => {
    const next: ReceiveMethod = index === 0 ? 0 : 1;
    setReceiveMethod(next);
    if (next === 0) {
      setPickupStartDate('');
      setPickupEndDate('');
      setPickupLocation('');
    } else {
      setProductionStartDate('');
      setProductionEndDate('');
      setDeliveryStartDate('');
      setDeliveryEndDate('');
    }
  };

  const goNext = () => {
    if (currentStep === 1) return setCurrentStep(type === 0 ? 2 : 3);
    if (currentStep === 2) return setCurrentStep(3);
  };

  const goPrev = () => {
    if (currentStep === 2) return setCurrentStep(1);
    if (currentStep === 3) return setCurrentStep(type === 0 ? 2 : 1);
  };

  const addOption = () =>
    setOptions((prev) => {
      if (prev.length >= 2) return prev;
      return [...prev, { id: `opt-${Date.now()}`, optionName: '', values: [{ id: `val-${Date.now()}`, value: '', extraPrice: 0 }] }];
    });
  const removeOption = (optionId: string) => setOptions((prev) => prev.filter((opt) => opt.id !== optionId));
  const addOptionValue = (optionId: string) => setOptions((prev) => prev.map((opt) => (opt.id === optionId ? { ...opt, values: [...opt.values, { id: `val-${Date.now()}`, value: '', extraPrice: 0 }] } : opt)));
  const removeOptionValue = (optionId: string, valueId: string) =>
    setOptions((prev) =>
      prev.map((opt) => {
        if (opt.id !== optionId) return opt;
        if (opt.values.length <= 1) return opt;
        return { ...opt, values: opt.values.filter((v) => v.id !== valueId) };
      })
    );
  const updateOptionName = (optionId: string, value: string) => setOptions((prev) => prev.map((opt) => (opt.id === optionId ? { ...opt, optionName: value } : opt)));
  const updateOptionValue = (optionId: string, valueId: string, field: 'value' | 'extraPrice', value: string) =>
    setOptions((prev) =>
      prev.map((opt) =>
        opt.id === optionId
          ? { ...opt, values: opt.values.map((v) => (v.id === valueId ? { ...v, [field]: field === 'extraPrice' ? Math.max(0, Number(value || 0)) : value } : v)) }
          : opt
      )
    );

  const handleUploadThumb = async (file: File | null) => {
    if (!file) return;
    setUploading((prev) => ({ ...prev, thumbnail: true }));
    try {
      setThumbnailUrl(await uploadProductImage(file, 'PRODUCT_THUMBNAIL'));
    } catch (error: any) {
      alert(error?.message ?? KR.thumbnailUploadFail);
    } finally {
      setUploading((prev) => ({ ...prev, thumbnail: false }));
    }
  };

  const handleUploadDetail = async (files: FileList | null) => {
    if (!files?.length) return;
    const remains = Math.max(0, DETAIL_IMAGE_MAX - detailImageUrls.length);
    if (!remains) return;
    setUploading((prev) => ({ ...prev, detail: true }));
    try {
      const uploaded = await Promise.all(Array.from(files).slice(0, remains).map((f) => uploadProductImage(f, 'PRODUCT_DETAIL')));
      setDetailImageUrls((prev) => [...prev, ...uploaded]);
    } catch (error: any) {
      alert(error?.message ?? KR.detailUploadFail);
    } finally {
      setUploading((prev) => ({ ...prev, detail: false }));
    }
  };

  const handleUploadNotice = async (file: File | null) => {
    if (!file) return;
    setUploading((prev) => ({ ...prev, notice: true }));
    try {
      setNoticeImgUrl(await uploadProductImage(file, 'PRODUCT_NOTICE'));
    } catch (error: any) {
      alert(error?.message ?? KR.noticeUploadFail);
    } finally {
      setUploading((prev) => ({ ...prev, notice: false }));
    }
  };

  const handleEditClick = () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setShowUpdateModal(true);
  };

  const handleConfirmUpdate = async () => {
    const salesStart = toIso(salesStartDate);
    const salesEnd = toIso(salesEndDate, true);
    if (!salesStart || !salesEnd || !updatedAt) {
      setSubmitError(KR.dateInvalid);
      setShowUpdateModal(false);
      return;
    }

    const body: Record<string, unknown> = {
      teamId,
      name: name.trim(),
      description: description.trim(),
      type,
      receiveMethod,
      salesStartDate: salesStart,
      salesEndDate: salesEnd,
      thumbnailUrl,
      detailImageUrls,
      noticeImgUrl,
      price,
      options: normalizedOptions,
      updatedAt,
    };

    if (type === 0) {
      body.goalAmount = goalAmount;
      if (receiveMethod === 0) {
        body.productionStartDate = toIso(productionStartDate);
        body.productionEndDate = toIso(productionEndDate, true);
        body.deliveryStartDate = toIso(deliveryStartDate);
        body.deliveryEndDate = toIso(deliveryEndDate, true);
      } else if (receiveMethod === 1) {
        body.pickupStartDate = toIso(pickupStartDate);
        body.pickupEndDate = toIso(pickupEndDate, true);
        body.pickupLocation = pickupLocation.trim();
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/admin/product/update/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || json?.status !== 'success') {
        if (res.status === 409 || json?.code === 'CONFLICT') {
          throw new Error(KR.conflict);
        }
        throw new Error(json?.message ?? KR.updateFail);
      }
      router.push('/admin/product?toast=updated');
    } catch (error: any) {
      setSubmitError(error?.message ?? KR.updateFail);
      setIsSubmitting(false);
      setShowUpdateModal(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-neutral-3" />;
  if (errorMessage) return <div className="min-h-screen bg-neutral-3">{errorMessage}</div>;

  return (
    <div className="min-h-screen bg-neutral-3">
      <div className="mx-auto flex min-h-screen w-full max-w-[375px] flex-col bg-neutral-3">
        <NavBar variant="title-back-trash" title={KR.editProduct} onBack={() => router.push('/admin/product')} />

        <div className="flex items-center justify-center px-[148px] py-[14px]">
          <div className="flex items-center gap-[14px]">
            <StepProgress status={progress[0]} />
            <StepProgress status={progress[1]} />
            <StepProgress status={progress[2]} />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto px-4">
          {currentStep === 1 ? (
            <div className="flex flex-col gap-5">
              <TextField id="team" label={KR.salesTeam} showStar state="disabled" inputProps={{ value: teamName, readOnly: true }} />
              <TextField id="name" label={KR.productName} showStar state="filled" inputProps={{ value: name, onChange: (e) => setName(e.target.value) }} />
              <TextField id="desc" label={KR.productDesc} showStar state="filled" inputProps={{ value: description, onChange: (e) => setDescription(e.target.value) }} />

              <section className="space-y-2">
                <div className="flex items-center gap-1">
                  <p className="typo-body-small-bold text-neutral-10">{KR.productType}</p>
                  <span className="typo-body-xsmall-bold text-danger">*</span>
                </div>
                <Radiocardgroup
                  className="w-full"
                  options={PRODUCT_TYPE_OPTIONS.map((opt) => opt.label)}
                  optionStatuses={PRODUCT_TYPE_OPTIONS.map((opt) =>
                    isDisabledProductType(opt.value) ? 'disabled' : 'default'
                  )}
                  selectedIndex={type === 0 ? 0 : type === 1 ? 1 : 2}
                  onSelect={onTypeSelect}
                />
              </section>

              <section className="space-y-2">
                {type === 0 ? (
                  <Radiocardgroup className="w-full" options={[KR.parcel, KR.pickup]} selectedIndex={receiveMethod === 0 ? 0 : 1} onSelect={onReceiveMethodSelect} />
                ) : type === 1 ? (
                  <Radiocardgroup className="w-full" options={[KR.parcel, KR.pickup]} selectedIndex={1} optionStatuses={['disabled', 'checked']} />
                ) : (
                  <Radiocardgroup className="w-full" options={[KR.parcel, KR.pickup]} selectedIndex={null} optionStatuses={['disabled', 'disabled']} />
                )}
              </section>

              <DateRangeInput
                title={KR.salesPeriod}
                required
                startLabel={KR.salesStart}
                endLabel={KR.salesEnd}
                startValue={salesStartDate}
                endValue={salesEndDate}
                onChangeStart={setSalesStartDate}
                onChangeEnd={setSalesEndDate}
              />

              <section className="flex w-full flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <p className="typo-body-small-bold text-neutral-10">{KR.thumbnailImage}</p>
                    <span className="typo-body-xsmall-bold text-danger">*</span>
                  </div>
                  <p className="text-[11px] leading-[1.5] text-neutral-8">{KR.thumbnailImageHelp}</p>
                </div>
                <div className="h-[100px] w-full">
                  {thumbnailUrl ? (
                    <ProductImage
                      property1="Default"
                      src={thumbnailUrl}
                      onRemove={() => setThumbnailUrl('')}
                      disabled={uploading.thumbnail}
                    />
                  ) : (
                    <ProductImage
                      property1="empty"
                      countText="0/1"
                      onClick={() => thumbInputRef.current?.click()}
                      disabled={uploading.thumbnail}
                    />
                  )}
                </div>
                {uploading.thumbnail ? <p className="typo-body-xsmall text-neutral-8">{KR.uploading}</p> : null}
              </section>

              <section className="flex w-full flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <p className="typo-body-small-bold text-neutral-10">{KR.detailImage}</p>
                    <span className="typo-body-xsmall-bold text-danger">*</span>
                  </div>
                  <p className="text-[11px] leading-[1.5] text-neutral-8">{KR.detailImageHelp}</p>
                </div>
                <div className="flex min-h-[100px] w-full gap-[5px] overflow-x-auto pb-1">
                  {detailImageUrls.map((src, i) => (
                    <ProductImage
                      key={`${src}-${i}`}
                      property1="Default"
                      src={src}
                      onRemove={() => setDetailImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={uploading.detail}
                    />
                  ))}
                  {detailImageUrls.length < DETAIL_IMAGE_MAX ? (
                    <ProductImage
                      property1={detailImageUrls.length ? 'add' : 'empty'}
                      countText={`${detailImageUrls.length}/${DETAIL_IMAGE_MAX}`}
                      onClick={() => detailInputRef.current?.click()}
                      disabled={uploading.detail}
                    />
                  ) : null}
                </div>
                {uploading.detail ? <p className="typo-body-xsmall text-neutral-8">{KR.uploading}</p> : null}
              </section>

              <section className="flex w-full flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <p className="typo-body-small-bold text-neutral-10">{KR.noticeImage}</p>
                    <span className="typo-body-xsmall-bold text-danger">*</span>
                  </div>
                  <p className="text-[11px] leading-[1.5] text-neutral-8">{KR.noticeImageHelp}</p>
                </div>
                <div className="h-[100px] w-full">
                  {noticeImgUrl ? (
                    <ProductImage
                      property1="Default"
                      src={noticeImgUrl}
                      onRemove={() => setNoticeImgUrl('')}
                      disabled={uploading.notice}
                    />
                  ) : (
                    <ProductImage
                      property1="empty"
                      countText="0/1"
                      onClick={() => noticeInputRef.current?.click()}
                      disabled={uploading.notice}
                    />
                  )}
                </div>
                {uploading.notice ? <p className="typo-body-xsmall text-neutral-8">{KR.uploading}</p> : null}
              </section>
            </div>
          ) : null}

          {currentStep === 2 && type === 0 ? (
            <div className="flex flex-col gap-5">
              <section className="space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <p className="typo-body-small-bold text-neutral-12">{KR.goalAmount}</p>
                    <span className="typo-body-xsmall-bold text-danger">*</span>
                  </div>
                  <p className="text-[11px] leading-[1.5] text-neutral-8">{KR.goalAmountHelp}</p>
                </div>
                <PriceField value={goalAmount} onChange={setGoalAmount} />
              </section>

              {receiveMethod === 0 ? (
                <>
                  <DateRangeInput
                    title={KR.productionPeriod}
                    required
                    startLabel={KR.productionStart}
                    endLabel={KR.productionEnd}
                    startValue={productionStartDate}
                    endValue={productionEndDate}
                    onChangeStart={setProductionStartDate}
                    onChangeEnd={setProductionEndDate}
                  />
                  <DateRangeInput
                    title={KR.deliveryPeriod}
                    required
                    startLabel={KR.deliveryStart}
                    endLabel={KR.deliveryEnd}
                    startValue={deliveryStartDate}
                    endValue={deliveryEndDate}
                    onChangeStart={setDeliveryStartDate}
                    onChangeEnd={setDeliveryEndDate}
                  />
                </>
              ) : (
                <>
                  <DateRangeInput
                    title={KR.pickupPeriod}
                    required
                    startLabel={KR.pickupStart}
                    endLabel={KR.pickupEnd}
                    startValue={pickupStartDate}
                    endValue={pickupEndDate}
                    onChangeStart={setPickupStartDate}
                    onChangeEnd={setPickupEndDate}
                  />
                  <TextField
                    id="pickupLocation"
                    label={KR.pickupLocation}
                    showStar
                    subtext={KR.pickupLocationSubtext}
                    placeholder={KR.pickupLocationPlaceholder}
                    state={pickupLocation.trim().length > 0 ? 'filled' : 'default'}
                    inputProps={{ value: pickupLocation, onChange: (e) => setPickupLocation(e.target.value) }}
                  />
                </>
              )}
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="flex flex-col gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <p className="typo-body-small-bold text-neutral-10">{'\uAC00\uACA9'}</p>
                  <span className="typo-body-xsmall-bold text-danger">*</span>
                </div>
                <PriceField value={price} onChange={setPrice} />
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <p className="typo-body-small-bold text-neutral-10">{KR.option}</p>
                  <p className="text-[11px] leading-[1.5] text-neutral-8">{KR.optionOptionalHelp}</p>
                </div>

                {options.map((opt, idx) => (
                  <div key={opt.id} className="w-full rounded-[8px] bg-neutral-1 px-[15px] py-[11px]">
                    <div className="flex flex-col items-center gap-[14px]">
                      <div className="flex w-full flex-col gap-[14px]">
                        <div className="flex items-center justify-between">
                          <p className="typo-heading-xxsmall text-black">{`${KR.option} ${idx + 1}`}</p>
                          <button type="button" className="inline-flex h-5 w-5 items-center justify-center" onClick={() => removeOption(opt.id)} aria-label={`${KR.option} 삭제`}>
                            <CloseIcon />
                          </button>
                        </div>

                        <div className="flex w-full flex-col gap-3">
                          <OptionName
                            className="w-full"
                            variant={
                              duplicateOptionNames.has(opt.optionName.trim())
                                ? 'error'
                                : focusedOptionNameId === opt.id
                                  ? 'focus'
                                  : opt.optionName.trim()
                                    ? 'filled'
                                    : 'Default'
                            }
                            label={KR.optionName}
                            value={opt.optionName}
                            placeholder={KR.optionNamePlaceholder}
                            inputProps={{
                              onChange: (e) => updateOptionName(opt.id, e.target.value),
                              onFocus: () => setFocusedOptionNameId(opt.id),
                              onBlur: () => setFocusedOptionNameId((prev) => (prev === opt.id ? null : prev)),
                            }}
                          />

                          {opt.values.map((v) => (
                            <OptionVariation
                              key={v.id}
                              className="w-full"
                              variant={
                                duplicateOptionValuesByOptionId.get(opt.id)?.has(v.value.trim())
                                  ? 'error'
                                  : focusedOptionValueId === v.id
                                    ? 'focus'
                                    : v.value.trim() || v.extraPrice > 0
                                      ? 'filled'
                                      : 'Default'
                              }
                              optionLabel={v.value}
                              extraPrice={v.extraPrice > 0 ? formatNumber(String(v.extraPrice)) : ''}
                              optionPlaceholder={KR.optionValuePlaceholder}
                              optionInputProps={{
                                onChange: (e) => updateOptionValue(opt.id, v.id, 'value', e.target.value),
                                onFocus: () => setFocusedOptionValueId(v.id),
                                onBlur: () => setFocusedOptionValueId((prev) => (prev === v.id ? null : prev)),
                              }}
                              priceInputProps={{
                                inputMode: 'numeric',
                                onChange: (e) => updateOptionValue(opt.id, v.id, 'extraPrice', digitsOnly(e.target.value)),
                                onFocus: () => setFocusedOptionValueId(v.id),
                                onBlur: () => setFocusedOptionValueId((prev) => (prev === v.id ? null : prev)),
                              }}
                              onRemove={opt.values.length > 1 ? () => removeOptionValue(opt.id, v.id) : undefined}
                            />
                          ))}
                        </div>
                      </div>

                      <button type="button" className="inline-flex h-6 w-6 items-center justify-center" onClick={() => addOptionValue(opt.id)} aria-label={`${KR.optionValue} 추가`}>
                        <PlusPillIcon />
                      </button>
                    </div>
                  </div>
                ))}

                {options.length < 2 ? (
                  <button type="button" onClick={addOption} className="h-10 w-full rounded-[8px] bg-[#e9ded2] typo-body-xsmall-bold text-neutral-10">
                    {KR.optionAdd}
                  </button>
                ) : null}
              </div>
              {optionValidationError ? <p className="typo-body-xsmall text-danger">{optionValidationError}</p> : null}
              {submitError ? <p className="typo-body-xsmall text-danger">{submitError}</p> : null}
            </div>
          ) : null}
        </main>

        <footer className="px-4 pb-8 pt-[17px]">
          <div className="flex items-start gap-[10px]">
            <ArrowButton direction="left" onClick={goPrev} disabled={currentStep === 1} />
            <button
              type="button"
              onClick={handleEditClick}
              disabled={!canSubmit}
              className="flex min-h-[55px] flex-1 items-center justify-center rounded-[8px] bg-orange-5 typo-body-small-bold text-neutral-2 disabled:cursor-not-allowed disabled:bg-orange-4"
            >
              {KR.edit}
            </button>
            <ArrowButton direction="right" onClick={goNext} disabled={currentStep === 3} />
          </div>
        </footer>
      </div>

      <input ref={thumbInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void handleUploadThumb(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} />
      <input ref={detailInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { void handleUploadDetail(e.target.files); e.currentTarget.value = ''; }} />
      <input ref={noticeInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void handleUploadNotice(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} />

      {showUpdateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-8">
          <Modal
            className="w-[311px] px-6 pb-5 pt-8"
            title={KR.editModalTitle}
            cancelText={KR.cancel}
            confirmText={isSubmitting ? KR.editing : KR.confirm}
            disabled={isSubmitting}
            onCancel={() => setShowUpdateModal(false)}
            onConfirm={() => void handleConfirmUpdate()}
          />
        </div>
      ) : null}
    </div>
  );
}
