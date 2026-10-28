import { z } from 'zod';
import { ORDER_PAYMENT_METHOD } from '@/lib/order-status';

const ProductTypeSchema = z.union([z.literal(0), z.literal(1)]); // fund | buy now
const ReceiveMethodSchema = z.union([z.literal(0), z.literal(1)]); // delivery | pickup
const PaymentMethodSchema = z.union([z.literal(ORDER_PAYMENT_METHOD.ONLINE), z.literal(ORDER_PAYMENT_METHOD.ON_SITE)]); // online | on-site (세부 PG 수단은 PortOne 결제창에서 선택)
const CardCompanySchema = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4),
  z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9),
]); // bc | woori | samsung | hyundai | lotte | hana | kookmin | nh | shinhan | citi
const BankCodeSchema = z.union([z.literal(0), z.literal(1)]); // ibk | shinhan
const EasyPayProviderSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]); // kakao | naver | toss

const OrderItemSchema = z.object({
  productId: z.string().min(1, 'productId is required.'),
  quantity: z.coerce.number().int().min(1, 'quantity must be >= 1.'),
  optionData: z.unknown().optional().nullable(),
});

export const createOrderSchema = z
  .object({
    userId: z.string().min(1).optional().nullable(),
    productType: ProductTypeSchema,
    receiveMethod: ReceiveMethodSchema,
    receiverName: z.string().trim().optional().nullable(),
    receiverPhone: z.string().trim().optional().nullable(),
    deliveryZipCode: z.string().trim().optional().nullable(),
    deliveryAddressMain: z.string().trim().optional().nullable(),
    deliveryAddressDetail: z.string().trim().optional().nullable(),
    deliveryMessage: z.string().trim().optional().nullable(),
    ordererName: z.string().trim().optional().nullable(),
    ordererPhone: z.string().trim().optional().nullable(),
    paymentMethod: PaymentMethodSchema,
    cardCompany: CardCompanySchema.optional().nullable(),
    bankCode: BankCodeSchema.optional().nullable(),
    easyPayProvider: EasyPayProviderSchema.optional().nullable(),
    isPolicyAgreed: z.boolean().optional(),
    billingKey: z.string().trim().min(1).optional(), // Fund 카드 결제 시 빌링키 (헥토)
    items: z.array(OrderItemSchema).min(1, 'at least one order item is required.'),
  })
  .superRefine((data, ctx) => {
    const isFund = data.productType === 0;
    const isBuyNow = data.productType === 1;
    const isFundDelivery = data.productType === 0 && data.receiveMethod === 0;
    const isFundPickup = data.productType === 0 && data.receiveMethod === 1;
    const requiresPolicyAgreement = data.productType === 1 || (data.productType === 0 && data.receiveMethod === 1);

    if (isFund) {
      if (!data.ordererName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ordererName'],
          message: 'ordererName is required for fund orders.',
        });
      }
      if (!data.ordererPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ordererPhone'],
          message: 'ordererPhone is required for fund orders.',
        });
      }
      if (!data.receiverName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['receiverName'],
          message: 'receiverName is required for fund orders.',
        });
      }
      if (!data.receiverPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['receiverPhone'],
          message: 'receiverPhone is required for fund orders.',
        });
      }
    }

    if (isFundDelivery) {
      if (!data.deliveryZipCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deliveryZipCode'],
          message: 'deliveryZipCode is required for fund delivery.',
        });
      }
      if (!data.deliveryAddressMain) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deliveryAddressMain'],
          message: 'deliveryAddressMain is required for fund delivery.',
        });
      }
      if (!data.deliveryAddressDetail) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['deliveryAddressDetail'],
          message: 'deliveryAddressDetail is required for fund delivery.',
        });
      }
    }

    if (isFund && data.paymentMethod !== ORDER_PAYMENT_METHOD.ONLINE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paymentMethod'],
        message: 'INVALID_PAYMENT_METHOD',
      });
    }

    if (requiresPolicyAgreement && data.isPolicyAgreed !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isPolicyAgreed'],
        message: 'isPolicyAgreed must be true for this order type.',
      });
    }

    if (isFund) {
      const uniqueProductIds = new Set(data.items.map((item) => item.productId));
      if (uniqueProductIds.size > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items'],
          message: 'fund orders can contain only one productId per order.',
        });
      }
    }

    // fund: 결제방법은 온라인 하나이고, 카드/계좌 선택은 세부 컬럼(cardCompany | bankCode)으로 구분한다.
    if (isFund && data.paymentMethod === ORDER_PAYMENT_METHOD.ONLINE) {
      const hasCard = data.cardCompany !== null && data.cardCompany !== undefined;
      const hasBank = data.bankCode !== null && data.bankCode !== undefined;
      if (!hasCard && !hasBank) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cardCompany'],
          message: 'INVALID_CARD_COMPANY',
        });
      }
      if (hasCard && hasBank) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bankCode'],
          message: 'INVALID_PAYMENT_DETAIL_COMBINATION',
        });
      }
      if (data.easyPayProvider !== null && data.easyPayProvider !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['easyPayProvider'],
          message: 'INVALID_PAYMENT_DETAIL_COMBINATION',
        });
      }
    }

    if (data.paymentMethod === ORDER_PAYMENT_METHOD.ON_SITE) {
      if (!isBuyNow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentMethod'],
          message: 'INVALID_PAYMENT_METHOD',
        });
      }
      if (data.cardCompany !== null && data.cardCompany !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cardCompany'],
          message: 'INVALID_PAYMENT_DETAIL_COMBINATION',
        });
      }
      if (data.bankCode !== null && data.bankCode !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bankCode'],
          message: 'INVALID_PAYMENT_DETAIL_COMBINATION',
        });
      }
      if (data.easyPayProvider !== null && data.easyPayProvider !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['easyPayProvider'],
          message: 'INVALID_PAYMENT_DETAIL_COMBINATION',
        });
      }
    }

    if (isBuyNow) {
      if (data.cardCompany !== null && data.cardCompany !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cardCompany'],
          message: 'INVALID_PAYMENT_DETAIL_COMBINATION',
        });
      }
      if (data.bankCode !== null && data.bankCode !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bankCode'],
          message: 'INVALID_PAYMENT_DETAIL_COMBINATION',
        });
      }
      if (data.easyPayProvider !== null && data.easyPayProvider !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['easyPayProvider'],
          message: 'INVALID_PAYMENT_DETAIL_COMBINATION',
        });
      }
    }

    if (isFundPickup && data.isPolicyAgreed !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isPolicyAgreed'],
        message: 'POLICY_AGREEMENT_REQUIRED',
      });
    }
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateOrderItemInput = z.infer<typeof OrderItemSchema>;
