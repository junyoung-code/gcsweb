'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { salesApiErrorMessage } from '@/lib/services/sales-management-store-api-service';
import Button from '@/components/ui/button/Button';
import TextField from '@/components/ui/common/TextField';
import type { SalesProduct, ProductFormInput } from '@/types/sales-management';
import type { SalesManagementV2Service } from '@/lib/services/sales-management-service';
import ProductDialog from './ProductDialog';
import { productAssets, productsPath } from './ProductsShell';
import styles from './products.module.css';
import landingStyles from '../landing.module.css';

type OptionRow = { key: number; name: string; price: string; stock: string };
const validNumber = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
const displayNumber = (value: string) => validNumber(value) ? Number(value).toLocaleString('ko-KR') : value;
// Reject invalid edits instead of turning a negative/decimal into a different number.
const numberInput = (value: string, previous: string) => /^[\d,]*$/.test(value) ? value.replaceAll(',', '') : previous;

export default function ProductForm({ product, storeId, categories, service, onSaved, onCategoryCreated }: {
  product?: SalesProduct; storeId: string; categories: string[]; service: SalesManagementV2Service;
  onSaved: () => Promise<void>; onCategoryCreated: (name: string) => void;
}) {
  const router = useRouter();
  const apiMode = service.dataSource === 'api';
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [stock, setStock] = useState(product ? String(product.stock) : '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl);
  const [imagePending, setImagePending] = useState(false);
  const [usesOptions, setUsesOptions] = useState(Boolean(product?.options.length));
  const [options, setOptions] = useState<OptionRow[]>(product?.options.map((option, key) => ({ key, name: option.name, price: String(option.price), stock: String(option.stock) })) ?? []);
  const sequence = useRef(options.length);
  const busy = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const locked = pending || completed;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const totalStock = options.reduce((sum, option) => sum + (validNumber(option.stock) ? Number(option.stock) : 0), 0);
  const valid = name.trim().length > 0 && name.length <= 20 && validNumber(price) && (usesOptions
    ? options.length > 0 && Number.isSafeInteger(totalStock) && options.every(option => option.name.trim().length > 0 && option.name.length <= 18 && validNumber(option.price) && validNumber(option.stock))
    : validNumber(stock));

  function addOption() { setOptions(current => [...current, { key: sequence.current++, name: '', price: '0', stock: '' }]); }
  function changeOption(key: number, field: 'name' | 'price' | 'stock', value: string) {
    setOptions(current => current.map(option => option.key === key ? { ...option, [field]: value } : option));
  }
  async function selectCategory(value: string) {
    if (Array.from(value.trim()).length > 8) { setError('카테고리는 최대 8자까지 입력해주세요.'); return; }
    try {
      const selected = await service.createCategory(value);
      onCategoryCreated(selected); setCategory(selected); setCategoryQuery(''); setCategoryOpen(false); setError('');
    } catch (error) { setError(salesApiErrorMessage(error, '카테고리를 저장하지 못했어요. 다시 시도해주세요.')); }
  }
  async function selectImage(file?: File) {
    if (!file || locked || imagePending) return;
    const invalid = apiMode
      ? !file.size || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase()) || file.size > 10 * 1024 * 1024 || !/\.(jpe?g|png|webp)$/i.test(file.name)
      : !['image/jpeg', 'image/png'].includes(file.type) || file.size > 50 * 1024 * 1024;
    if (invalid) {
      setToast({ message: '업로드 할 수 없는 파일입니다. 파일 형식이나 용량을 확인해주세요.' });
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setImagePending(true); setToast(null);
    try {
      const url = await service.uploadProductImage(file);
      setImageUrl(url);
    } catch (error) { setToast({ message: salesApiErrorMessage(error, '이미지를 불러오지 못했어요. 다시 선택해주세요.') }); }
    finally {
      setImagePending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  function removeImage() {
    if (locked || imagePending) return;
    setImageUrl(undefined); setToast(null);
    if (fileRef.current) fileRef.current.value = '';
  }
  async function save() {
    if (busy.current || completed || !valid || imagePending) return;
    busy.current = true; setPending(true); setError('');
    const input: ProductFormInput = { storeId, name, category, imageUrl, price: Number(price), stock: usesOptions ? totalStock : Number(stock), usesOptions,
      options: options.map(option => ({ name: option.name, price: Number(option.price), stock: Number(option.stock) })) };
    try {
      await service.saveProduct(input, product?.id);
      if (product) setCompleted(true);
      else {
        setName(''); setCategory(''); setCategoryQuery(''); setPrice(''); setStock(''); setImageUrl(undefined); setUsesOptions(false); setOptions([]);
        if (fileRef.current) fileRef.current.value = '';
      }
      try { await onSaved(); }
      catch { setError('상품은 저장되었지만 목록을 불러오지 못했어요. 전체 상품에서 다시 확인해주세요.'); }
    } finally { busy.current = false; setPending(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || locked || imagePending) return;
    if (product) void save().catch(error => setError(salesApiErrorMessage(error, '수정하지 못했어요. 입력 내용을 유지했으니 다시 시도해주세요.')));
    else setConfirming(true);
  }

  return <>
    <form onSubmit={submit} className={styles.form} aria-label={product ? '상품 수정' : '상품 등록'}>
      <div className={styles.formLayout}>
        <div className={styles.imageField}>
          <div className={styles.imageControl}>
            <input ref={fileRef} className="sr-only" type="file" id="product-image" accept={apiMode ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png'} aria-describedby="product-image-help" aria-label="상품 이미지 선택" disabled={locked || imagePending} onChange={event => { void selectImage(event.target.files?.[0]); }} />
            <button className={styles.upload} type="button" aria-label="상품 이미지 등록" disabled={locked || imagePending} onClick={() => fileRef.current?.click()}>
            {imageUrl ? <Image src={imageUrl} alt="상품 이미지 미리보기" width={210} height={210} unoptimized className={imageUrl === `${productAssets}/bag.png` ? styles.bagImage : styles.productImage} />
              : <Image src={`${productAssets}/upload.svg`} alt="" width={70} height={70} />}
          </button>
            {imageUrl && <button type="button" className={styles.removeImage} aria-label="상품 이미지 삭제" disabled={locked || imagePending} onClick={removeImage}>
            <Image src={`${productAssets}/image-close.svg`} alt="" width={30} height={30} />
          </button>}
          </div>
          <p id="product-image-help" className={styles.imageHelp}>{apiMode ? 'JPEG,PNG,WebP / 10MB 이하' : 'JPEG,PNG / 50MB 이하'}</p>
        </div>
        <div className={styles.fields}>
          <div className={styles.field}><TextField id="product-name" label="상품명" showStar placeholder="상품명을 입력해주세요." rightSlot={name && <button type="button" className={styles.clearName} aria-label="상품명 지우기" disabled={locked} onClick={() => { setName(''); document.getElementById('product-name')?.focus(); }}><Image src="/assets/icons/icon-clear.svg" alt="" width={20} height={20} /></button>} inputProps={{ autoComplete: 'off', value: name, maxLength: 20, onChange: event => setName(event.target.value), className: styles.input, disabled: locked }} /></div>
          <div className={styles.categoryField} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setCategoryOpen(false); }}>
            <label htmlFor="product-category">카테고리</label>
            <div className={styles.categoryInput}>
              {category ? <span className={styles.categoryTag}>{category}<button type="button" aria-label="카테고리 해제" disabled={locked} onClick={() => setCategory('')}><Image src={`${productAssets}/category-close.svg`} width={22} height={22} alt="" /></button></span>
                : <input id="product-category" role="combobox" aria-haspopup="dialog" aria-label="카테고리" aria-expanded={categoryOpen} aria-controls="form-categories" value="" readOnly disabled={locked} placeholder="카테고리를 입력해주세요."
                  onFocus={() => setCategoryOpen(true)} onClick={() => setCategoryOpen(true)} />}
            </div>
            {categoryOpen && <div id="form-categories" role="dialog" aria-label="카테고리 선택" className={styles.categoryMenu} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setCategoryOpen(false); } }}>
              <input disabled={locked} autoFocus aria-label="카테고리 검색 및 생성" maxLength={8} autoComplete="off" placeholder="카테고리 검색 및 생성" value={categoryQuery}
                onChange={event => setCategoryQuery(event.target.value)} onKeyDown={event => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (categoryQuery.trim()) void selectCategory(categoryQuery); }
                }} />
              <div className={styles.categoryResults}>
                {categories.filter(item => item.toLocaleLowerCase().includes(categoryQuery.trim().toLocaleLowerCase())).map(item => <button type="button" disabled={locked} key={item} onClick={() => { void selectCategory(item); }}>{item}</button>)}
              </div>
            </div>}
          </div>
          <div className={styles.priceStock}>
            <div className={styles.field}><TextField id="product-price" label="가격" showStar placeholder="가격을 입력해주세요." inputProps={{ value: displayNumber(price), inputMode: 'numeric', onChange: event => setPrice(numberInput(event.target.value, price)), className: styles.input, disabled: locked }} /></div>
            <div className={styles.field}><TextField id="product-stock" label="총재고" showStar placeholder="총재고를 입력해주세요." inputProps={{ value: usesOptions ? totalStock.toLocaleString('ko-KR') : displayNumber(stock), readOnly: usesOptions, inputMode: 'numeric', onChange: event => setStock(numberInput(event.target.value, stock)), className: styles.input, disabled: locked }} /></div>
          </div>
          <div>
            <div className={styles.optionChoice} role="group" aria-labelledby="option-choice-label">
              <span id="option-choice-label" className={styles.optionLabel}>옵션</span>
              {[true, false].map(enabled => <label key={String(enabled)}>
                <input className={styles.radio} type="radio" name="options-enabled" checked={usesOptions === enabled} disabled={locked} onChange={() => { setUsesOptions(enabled); if (enabled && !options.length) addOption(); }} />
                <span className={styles.checkbox}><Image src={`${productAssets}/${usesOptions === enabled ? 'checked.svg' : 'unchecked.png'}`} alt="" width={usesOptions === enabled ? 21.5 : 24} height={usesOptions === enabled ? 21.5 : 24} /></span>
                {enabled ? '사용함' : '사용안함'}
              </label>)}
            </div>
            {usesOptions && <div className={styles.optionPanel}>
              <div className={styles.optionHead}><span>옵션명</span><span>추가금</span><span>재고</span><span /></div>
              {options.map((option, index) => <div className={styles.optionRow} key={option.key}>
                <input aria-label={`옵션명 ${index + 1}`} maxLength={18} placeholder="옵션명을 입력해주세요." value={option.name} disabled={locked} onChange={event => changeOption(option.key, 'name', event.target.value)} />
                <Image src={`${productAssets}/option-divider.svg`} width={2} height={28} alt="" />
                <input aria-label={`추가금 ${index + 1}`} inputMode="numeric" value={displayNumber(option.price)} disabled={locked} onChange={event => changeOption(option.key, 'price', numberInput(event.target.value, option.price))} />
                <Image src={`${productAssets}/option-divider.svg`} width={2} height={28} alt="" />
                <input aria-label={`옵션 재고 ${index + 1}`} placeholder="재고를 입력해주세요." inputMode="numeric" value={displayNumber(option.stock)} disabled={locked} onChange={event => changeOption(option.key, 'stock', numberInput(event.target.value, option.stock))} />
                <button type="button" aria-label={`옵션 ${index + 1} 삭제`} disabled={locked} onClick={() => { setOptions(current => current.filter(item => item.key !== option.key)); if (options.length === 1) setUsesOptions(false); }}><Image src={`${productAssets}/option-close.svg`} width={30} height={30} alt="" /></button>
              </div>)}
              <button type="button" className={styles.addOption} aria-label="옵션 추가" disabled={locked} onClick={addOption}><Image src={`${productAssets}/plus.svg`} width={24} height={24} alt="" /></button>
            </div>}
          </div>
          <Button type="submit" color="orange" className={styles.submit} disabled={!valid || locked || imagePending}>{product ? '상품 수정하기' : '상품 등록하기'}</Button>
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>
      </div>
    </form>
    {toast && <div role="alert" className={landingStyles.toast}>
      <Image src="/assets/sales-management/v2/info.svg" alt="" width={21.5} height={21.5} /><p>{toast.message}</p>
    </div>}
    {completed && <ProductDialog kind="updated" onDismiss={() => router.push(productsPath)} />}
    {confirming && <ProductDialog kind="create" onConfirm={save} onDismiss={() => setConfirming(false)} />}
  </>;
}
