import { z } from 'zod';
import { PRODUCT_TYPE, isSelectableProductType } from '@/lib/product-type';

const PRODUCT_NAME_MAX_LENGTH = 13;

export const newProductStep1Schema = z
  .object({
    teamId: z.string().min(1, '판매팀을 선택해주세요.'),
    name: z
      .string()
      .min(1, '상품명을 입력해주세요.')
      .max(PRODUCT_NAME_MAX_LENGTH, '글자수는 13자 이내로 작성해주세요'),
    description: z.string().min(1, '상품 설명을 입력해주세요.'),
    type: z.coerce.number().refine(isSelectableProductType, '상품 유형을 선택해주세요.'),
    receiveMethod: z.coerce.number().refine((n) => [0, 1].includes(n), '수령 방식을 선택해주세요.'),
    salesStartDate: z.string().min(1, '판매 시작일을 입력해주세요.'),
    salesEndDate: z.string().min(1, '판매 종료일을 입력해주세요.'),
  })
  .refine((data) => data.type !== PRODUCT_TYPE.BUY_NOW || data.receiveMethod === 1, {
    message: 'Buy Now는 현장 수령만 가능합니다.',
    path: ['receiveMethod'],
  });

export type NewProductStep1Input = z.infer<typeof newProductStep1Schema>;

/** Fund + 택배 배송: 목표금액, 제작기간, 배송기간 */
export const newProductStep2DeliverySchema = z.object({
  goalAmount: z.coerce.number().min(0, '목표 금액을 입력해주세요.'),
  productionStartDate: z.string().min(1, '제작 시작일을 입력해주세요.'),
  productionEndDate: z.string().min(1, '제작 종료일을 입력해주세요.'),
  deliveryStartDate: z.string().min(1, '배송 시작일을 입력해주세요.'),
  deliveryEndDate: z.string().min(1, '배송 종료일을 입력해주세요.'),
});

/** Fund + 현장 수령: 목표금액, 수령 기간, 수령 장소 */
export const newProductStep2PickupSchema = z.object({
  goalAmount: z.coerce.number().min(0, '목표 금액을 입력해주세요.'),
  pickupStartDate: z.string().min(1, '수령 시작일을 입력해주세요.'),
  pickupEndDate: z.string().min(1, '수령 종료일을 입력해주세요.'),
  pickupLocation: z.string().min(1, '수령 장소를 입력해주세요.'),
});

/** Buy Now: 가격(필수), 옵션(선택) */
const buyNowOptionValueSchema = z.object({
  value: z.string(),
  extraPrice: z.coerce.number().min(0, '0 이상 입력'),
});
const buyNowOptionSchema = z.object({
  optionName: z.string(),
  values: z.array(buyNowOptionValueSchema).min(1).default([]),
});
export const newProductStep2BuyNowSchema = z.object({
  price: z.coerce.number().min(0, '가격을 입력해주세요.'),
  options: z.array(buyNowOptionSchema).optional().default([]),
});

export type NewProductStep2DeliveryInput = z.infer<typeof newProductStep2DeliverySchema>;
export type NewProductStep2PickupInput = z.infer<typeof newProductStep2PickupSchema>;
export type NewProductStep2BuyNowInput = z.infer<typeof newProductStep2BuyNowSchema>;
export type NewProductStep2Input = NewProductStep2DeliveryInput | NewProductStep2PickupInput | NewProductStep2BuyNowInput;

export { PRODUCT_NAME_MAX_LENGTH };
