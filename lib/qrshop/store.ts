import QRCode from 'qrcode';
import { z } from 'zod';

export const STORE_NAME_MAX_LENGTH = 16;
export const STORE_SLUG_PATTERN = /^[a-z0-9]{4,}$/;

export const INVALID_STORE_NAME = '유효하지 않은 상점명';
export const INVALID_STORE_SLUG = '유효하지 않은 상점 아이디';
export const INVALID_STORE_REQUEST = '유효하지 않은 요청';

export const storeNameSchema = z
  .string({ required_error: INVALID_STORE_NAME, invalid_type_error: INVALID_STORE_NAME })
  .trim()
  .refine((value) => {
    // 이모지 등 서로게이트 페어는 한 글자로 센다(DB char_length 기준과 맞춘다).
    const length = [...value].length;
    return length >= 1 && length <= STORE_NAME_MAX_LENGTH;
  }, INVALID_STORE_NAME);

export const storeSlugSchema = z
  .string({ required_error: INVALID_STORE_SLUG, invalid_type_error: INVALID_STORE_SLUG })
  .refine((value) => STORE_SLUG_PATTERN.test(value), INVALID_STORE_SLUG);

export const createStoreSchema = z.object(
  { name: storeNameSchema, storeSlug: storeSlugSchema },
  { required_error: INVALID_STORE_REQUEST, invalid_type_error: INVALID_STORE_REQUEST },
);

export const updateStoreSchema = z
  .object(
    { name: storeNameSchema.optional(), storeSlug: storeSlugSchema.optional() },
    { required_error: INVALID_STORE_REQUEST, invalid_type_error: INVALID_STORE_REQUEST },
  )
  .refine((value) => value.name !== undefined || value.storeSlug !== undefined, INVALID_STORE_REQUEST);

export function getStoreOrigin(): string {
  const origin = process.env.NEXTAUTH_URL?.trim();
  if (origin) return origin.replace(/\/+$/, '');
  // QR코드는 인쇄해서 쓰므로 운영에서 origin이 비어 있으면 localhost URL이 새겨지지 않게 막는다.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_URL is not set.');
  }
  return 'http://localhost:3000';
}

/** 방문객용 QR샵 URL. `@`는 URL에만 붙고 DB의 storeSlug에는 저장하지 않는다. */
export function buildStoreUrl(storeSlug: string, origin: string = getStoreOrigin()): string {
  return `${origin}/QRshop/@${storeSlug}`;
}

type StoreRow = { storeId: string; name: string; storeSlug: string };

export function toStoreSummary(store: StoreRow) {
  return {
    storeId: store.storeId,
    name: store.name,
    storeSlug: store.storeSlug,
    storeUrl: buildStoreUrl(store.storeSlug),
  };
}

/** hasSalesHistory: 결제완료 주문이 1건이라도 있으면 true (상점 삭제하기 버튼 노출 판단용). */
export function toStoreDetail(store: StoreRow & { createdAt: Date }, hasSalesHistory: boolean) {
  return { ...toStoreSummary(store), createdAt: store.createdAt.toISOString(), hasSalesHistory };
}

export function generateStoreQrSvg(storeUrl: string): Promise<string> {
  return QRCode.toString(storeUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
}
