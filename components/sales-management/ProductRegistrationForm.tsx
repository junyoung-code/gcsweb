'use client';
/* eslint-disable @next/next/no-img-element -- URL 입력 미리보기는 실제 스토리지 연동 전 Mock 범위다. */

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { SalesManagementService } from '@/lib/services/sales-management-service';
import { createSalesManagementMockService } from '@/lib/mocks';
import type { ProductFormOptionInput, SalesProduct, SalesStore } from '@/types/sales-management';

interface ProductRegistrationFormProps {
  service?: SalesManagementService;
}

type FormErrors = Partial<Record<'name' | 'category' | 'price' | 'stock' | 'options', string>>;

const blankOption = (): ProductFormOptionInput => ({ name: '', price: 0, stock: 0 });

function formatPrice(price: number) {
  return new Intl.NumberFormat('ko-KR').format(price);
}

export default function ProductRegistrationForm({ service }: ProductRegistrationFormProps) {
  const [mockService] = useState(() => createSalesManagementMockService());
  const activeService = service ?? mockService;
  const [store, setStore] = useState<SalesStore | null | undefined>(undefined);
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [usesOptions, setUsesOptions] = useState(false);
  const [options, setOptions] = useState<ProductFormOptionInput[]>([blankOption()]);
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    void Promise.all([activeService.getStore(), activeService.getProducts()]).then(([nextStore, result]) => {
      setStore(nextStore);
      setProducts(result.items);
    });
  }, [activeService]);

  const updateOption = (index: number, field: keyof ProductFormOptionInput, value: string) => {
    setOptions((current) => current.map((option, optionIndex) => (
      optionIndex === index
        ? { ...option, [field]: field === 'name' ? value : Number(value) }
        : option
    )));
  };

  const validate = () => {
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = '상품명을 입력해주세요.';
    if (!category.trim()) nextErrors.category = '카테고리를 입력해주세요.';
    if (usesOptions) {
      if (options.length === 0 || options.some((option) => !option.name.trim() || option.price < 0 || option.stock < 0)) {
        nextErrors.options = '옵션명, 가격, 재고를 모두 입력해주세요.';
      }
    } else {
      if (!price || Number(price) < 0) nextErrors.price = '가격을 0원 이상으로 입력해주세요.';
      if (!stock || Number(stock) < 0) nextErrors.stock = '재고를 0개 이상으로 입력해주세요.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setName(''); setCategory(''); setImageUrl(''); setUsesOptions(false); setOptions([blankOption()]);
    setPrice(''); setStock(''); setErrors({});
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError('');
    setSuccessMessage('');
    if (!store || !validate()) return;

    setIsSubmitting(true);
    try {
      const normalizedOptions = usesOptions ? options : [];
      const product = await activeService.saveProduct({
        storeId: store.id,
        name: name.trim(),
        category: category.trim(),
        imageUrl: imageUrl.trim() || undefined,
        usesOptions,
        options: normalizedOptions,
        price: usesOptions ? Math.min(...normalizedOptions.map((option) => option.price)) : Number(price),
        stock: usesOptions ? normalizedOptions.reduce((sum, option) => sum + option.stock, 0) : Number(stock),
      });
      const result = await activeService.getProducts();
      setProducts(result.items);
      setSuccessMessage(`“${product.name}” 상품이 등록되었습니다.`);
      resetForm();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '상품 등록에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (store === undefined) return <p className="py-16 text-center typo-body-medium text-neutral-8">상품 등록 정보를 불러오는 중입니다.</p>;

  if (!store) return (
    <section className="rounded-xl bg-neutral-1 px-6 py-20 text-center">
      <h2 className="typo-heading-medium">상점을 먼저 등록해주세요.</h2>
      <p className="mt-2 typo-body-medium text-neutral-8">상점 등록 후 상품을 등록할 수 있습니다.</p>
    </section>
  );

  return (
    <div className="space-y-10">
      <form onSubmit={onSubmit} className="rounded-xl bg-neutral-1 p-6 sm:p-[46px]">
        <div className="grid gap-8 lg:grid-cols-[206px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-neutral-6 bg-neutral-3">
              {imageUrl ? <img src={imageUrl} alt="상품 미리보기" className="h-full w-full object-cover" /> : <span className="text-center typo-body-small text-neutral-8">상품 이미지<br />URL을 입력하세요</span>}
            </div>
            <label className="block typo-body-small text-neutral-8" htmlFor="product-image-url">이미지 URL (선택)</label>
            <input id="product-image-url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://" className="w-full rounded-lg border border-neutral-6 bg-neutral-2 px-3 py-2 typo-body-small outline-none focus:border-orange-5" />
          </div>

          <div className="space-y-6">
            <Field label="상품명" error={errors.name}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="상품명을 입력하세요" className="input" /></Field>
            <Field label="카테고리" error={errors.category}><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="예: 시계" className="input" /></Field>
            <fieldset>
              <legend className="typo-heading-medium">옵션</legend>
              <div className="mt-3 flex gap-5 typo-body-medium">
                <label className="flex items-center gap-2"><input type="radio" name="options" checked={usesOptions} onChange={() => setUsesOptions(true)} className="accent-orange-5" /> 사용함</label>
                <label className="flex items-center gap-2 text-neutral-8"><input type="radio" name="options" checked={!usesOptions} onChange={() => setUsesOptions(false)} className="accent-orange-5" /> 사용안함</label>
              </div>
            </fieldset>

            {usesOptions ? <OptionFields options={options} updateOption={updateOption} removeOption={(index) => setOptions((current) => current.filter((_, currentIndex) => currentIndex !== index))} addOption={() => setOptions((current) => [...current, blankOption()])} error={errors.options} /> : (
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="가격" error={errors.price}><input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="numeric" placeholder="0" className="input" /></Field>
                <Field label="재고" error={errors.stock}><input value={stock} onChange={(event) => setStock(event.target.value)} inputMode="numeric" placeholder="0" className="input" /></Field>
              </div>
            )}
            {successMessage ? <p role="status" className="rounded-lg bg-orange-1 px-4 py-3 typo-body-small-bold text-orange-8">{successMessage}</p> : null}
            {submitError ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 typo-body-small-bold text-danger">{submitError}</p> : null}
            <button type="submit" disabled={isSubmitting} className="rounded bg-orange-5 px-4 py-3 typo-body-large-bold text-neutral-1 disabled:cursor-wait disabled:bg-orange-3">{isSubmitting ? '상품 등록 중…' : '상품 등록하기'}</button>
          </div>
        </div>
      </form>

      <section><h2 className="mb-3 typo-heading-medium">등록된 상품</h2><div className="rounded-xl bg-neutral-1 p-6">{products.length === 0 ? <p className="py-6 text-center typo-heading-medium text-neutral-7">아직 상품이 등록되지 않았어요!</p> : <ul className="grid gap-3 sm:grid-cols-2">{products.map((product) => <li key={product.id} className="rounded-lg border border-neutral-5 p-4"><p className="typo-body-medium-bold">{product.name}</p><p className="mt-1 typo-body-small text-neutral-8">{product.category} · {formatPrice(product.price)}원 · 재고 {product.stock}개</p></li>)}</ul>}</div></section>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block typo-heading-medium">{label}</span>{children}{error ? <span role="alert" className="mt-2 block typo-body-small text-danger">{error}</span> : null}</label>;
}

function OptionFields({ options, updateOption, removeOption, addOption, error }: { options: ProductFormOptionInput[]; updateOption: (index: number, field: keyof ProductFormOptionInput, value: string) => void; removeOption: (index: number) => void; addOption: () => void; error?: string }) {
  return <div className="rounded-lg bg-neutral-3 p-4"><div className="grid gap-3 text-neutral-8 sm:grid-cols-[1fr_1fr_1fr_30px]"><span>옵션명</span><span>가격(원)</span><span>재고</span></div>{options.map((option, index) => <div key={index} className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_30px]"><input value={option.name} onChange={(event) => updateOption(index, 'name', event.target.value)} placeholder="PINK" className="input" /><input value={option.price || ''} onChange={(event) => updateOption(index, 'price', event.target.value)} inputMode="numeric" placeholder="0" className="input" /><input value={option.stock || ''} onChange={(event) => updateOption(index, 'stock', event.target.value)} inputMode="numeric" placeholder="0" className="input" /><button type="button" aria-label={`옵션 ${index + 1} 삭제`} onClick={() => removeOption(index)} disabled={options.length === 1} className="flex h-[46px] items-center justify-center rounded text-neutral-8 disabled:opacity-30"><Image src="/assets/icons/light/close.svg" alt="" width={20} height={20} /></button></div>)}<button type="button" aria-label="옵션 추가" onClick={addOption} className="mx-auto mt-3 flex h-[30px] w-[30px] items-center justify-center rounded bg-neutral-5"><Image src="/assets/icons/light/plus.svg" alt="" width={20} height={20} /></button>{error ? <p role="alert" className="mt-2 typo-body-small text-danger">{error}</p> : null}</div>;
}
