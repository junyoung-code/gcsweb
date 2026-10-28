import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createOrderSchema } from '@/lib/validations/order';
import { getSaleStatusByDate } from '@/lib/sale-date';
import { isMatchedVariantSoldOut } from '@/lib/variant-signature';
import { issueOrderNumber } from '@/lib/qrshop/order-number';
import { getShopStoreId } from '@/lib/shop-store';
import { apiError as jsonError } from '@/lib/api-response';
import { ORDER_PAYMENT_METHOD, ORDER_PAYMENT_STATUS } from '@/lib/order-status';

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function mapValidationIssueToErrorCode(issue: { path?: (string | number)[]; message?: string }): string {
  const path = issue.path?.[0];
  if (issue.message === 'INVALID_PAYMENT_METHOD') return 'INVALID_PAYMENT_METHOD';
  if (issue.message === 'INVALID_PAYMENT_DETAIL_COMBINATION') return 'INVALID_PAYMENT_DETAIL_COMBINATION';
  if (issue.message === 'INVALID_CARD_COMPANY') return 'INVALID_CARD_COMPANY';
  if (issue.message === 'INVALID_BANK_CODE') return 'INVALID_BANK_CODE';
  if (issue.message === 'INVALID_EASY_PAY_PROVIDER') return 'INVALID_EASY_PAY_PROVIDER';
  if (issue.message === 'POLICY_AGREEMENT_REQUIRED') return 'POLICY_AGREEMENT_REQUIRED';

  if (path === 'cardCompany') return 'INVALID_CARD_COMPANY';
  if (path === 'bankCode') return 'INVALID_BANK_CODE';
  if (path === 'easyPayProvider') return 'INVALID_EASY_PAY_PROVIDER';
  if (path === 'isPolicyAgreed') return 'POLICY_AGREEMENT_REQUIRED';

  return 'INVALID_INPUT';
}

function extractAdditionalPrice(optionData: unknown): number {
  const list = Array.isArray(optionData) ? optionData : optionData && typeof optionData === 'object' ? [optionData] : [];
  return list.reduce((sum, item) => {
    if (!item || typeof item !== 'object') return sum;
    const value = (item as Record<string, unknown>).additionalPrice;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
}

function toDbJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function toTypeGroup(type: number): 0 | 1 {
  return type === 0 ? 0 : 1;
}

function hashGuestToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const ORDER_CREATE_MAX_RETRIES = 3;
const ORDER_CREATE_RETRY_BASE_DELAY_MS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableOrderCreateError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return true;
    if (error.code === 'P2034') return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('could not serialize access') || message.includes('serialization failure');
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email ?? null;

    if (!sessionEmail) {
      return jsonError(401, 'UNAUTHORIZED', 'authentication required.');
    }

    const user = await prisma.user.findFirst({ where: { email: sessionEmail },
      select: { id: true },
    });

    if (!user) {
      return jsonError(401, 'UNAUTHORIZED', 'authentication required.');
    }

    const url = new URL(request.url);
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const size = Math.min(parsePositiveInt(url.searchParams.get('size'), 20), 100);
    const skip = (page - 1) * size;

    const [total, orders] = await Promise.all([
      prisma.order.count({ where: { userId: user.id } }),
      prisma.order.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          productType: true,
          receiveMethod: true,
          receiverName: true,
          receiverPhone: true,
          deliveryZipCode: true,
          deliveryAddressMain: true,
          deliveryAddressDetail: true,
          deliveryMessage: true,
          ordererName: true,
          ordererPhone: true,
          paymentMethod: true,
          cardCompany: true,
          bankCode: true,
          easyPayProvider: true,
          paymentStatus: true,
          receiptStatus: true,
          paymentAmount: true,
          createdAt: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              price: true,
              optionData: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
      }),
    ]);

    return NextResponse.json({
      status: 'success',
      data: {
        orders,
        pagination: {
          page,
          size,
          total,
          totalPages: Math.ceil(total / size),
        },
      },
    });
  } catch (error) {
    console.error('Shop order list error:', error);
    return jsonError(500, 'SERVER_ERROR', 'server internal error.');
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email ?? null;

    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const code = mapValidationIssueToErrorCode(firstIssue ?? {});
      return jsonError(400, code, firstIssue?.message ?? 'invalid request body');
    }

    const data = parsed.data;
    const isFund = data.productType === 0;
    const isFundDelivery = data.productType === 0 && data.receiveMethod === 0;
    const isFundPickup = data.productType === 0 && data.receiveMethod === 1;
    const isBuyNow = data.productType === 1;

    let user:
      | {
          id: string;
          name: string;
          phone: string | null;
        }
      | null = null;

    if (sessionEmail) {
      user = await prisma.user.findFirst({ where: { email: sessionEmail },
        select: { id: true, name: true, phone: true },
      });
    }

    if (isFund && !user) {
      return jsonError(400, 'FUND_LOGIN_REQUIRED', 'fund orders require login.');
    }

    const rawGuestToken = request.headers.get('x-guest-token')?.trim() ?? '';
    const isAuthenticated = !!user;
    if (isBuyNow && !isAuthenticated && !rawGuestToken) {
      return jsonError(400, 'GUEST_TOKEN_REQUIRED', 'x-guest-token is required for guest order.');
    }

    const buyerType: 'USER' | 'GUEST' = isBuyNow
      ? (isAuthenticated ? 'USER' : 'GUEST')
      : 'USER';
    const buyerUserId = isAuthenticated ? user!.id : null;
    const buyerGuestTokenHash = isBuyNow && !isAuthenticated ? hashGuestToken(rawGuestToken) : null;

    const productIds = [...new Set(data.items.map((item) => item.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        type: true,
        receiveMethod: true,
        status: true,
        isPublic: true,
        isAdminApproved: true,
        salesStartDate: true,
        salesEndDate: true,
        price: true,
        variants: {
          select: {
            optionSignature: true,
            isSoldOut: true,
          },
        },
      },
    });

    if (products.length !== productIds.length) {
      return jsonError(404, 'PRODUCT_NOT_FOUND', 'one or more products were not found.');
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const productTypes = new Set(products.map((product) => toTypeGroup(product.type)));
    if (productTypes.size > 1) {
      return jsonError(400, 'MIXED_PRODUCT_TYPE_NOT_ALLOWED', 'fund and buyNow products cannot be ordered together.');
    }

    for (const product of products) {
      const saleStatus = getSaleStatusByDate(product.salesStartDate, product.salesEndDate);
      if (!product.isPublic || !product.isAdminApproved || saleStatus !== 'active') {
        return jsonError(404, 'PRODUCT_NOT_FOUND', 'one or more products were not available.');
      }
      if (toTypeGroup(product.type) !== data.productType) {
        return jsonError(400, 'INVALID_PRODUCT_TYPE', 'productType does not match the requested products.');
      }
      if (product.receiveMethod !== data.receiveMethod) {
        return jsonError(400, 'INVALID_RECEIVE_METHOD', 'receiveMethod does not match product configuration.');
      }
    }

    if (isFund && data.paymentMethod !== ORDER_PAYMENT_METHOD.ONLINE) {
      return jsonError(400, 'INVALID_PAYMENT_METHOD', 'this payment method is not allowed for fund.');
    }
    const normalizedBillingKey = data.billingKey?.trim() ?? '';
    // fund 카드 결제(cardCompany 선택)는 빌링키가 필요하다. 계좌(bankCode)는 빌링키 없음.
    const isFundCard = isFund && data.cardCompany !== null && data.cardCompany !== undefined;
    if (isFundCard && !normalizedBillingKey) {
      return jsonError(400, 'BILLING_KEY_REQUIRED', 'billingKey is required for fund card payment.');
    }

    if ((isBuyNow || isFundPickup) && data.isPolicyAgreed !== true) {
      return jsonError(400, 'POLICY_AGREEMENT_REQUIRED', 'policy agreement is required.');
    }

    let paymentAmount = 0;
    const itemRows = data.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new Error('PRODUCT_NOT_FOUND');
      }
      if (isMatchedVariantSoldOut(product.variants, item.optionData)) {
        throw new Error('VARIANT_SOLD_OUT');
      }
      const unitPrice = product.price + extractAdditionalPrice(item.optionData);
      paymentAmount += unitPrice * item.quantity;
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: unitPrice,
        optionData: toDbJson(item.optionData),
      };
    });

    const ordererName = isBuyNow ? null : data.ordererName?.trim() || user?.name || '';
    const ordererPhone = isBuyNow ? null : data.ordererPhone?.trim() || user?.phone || '';
    if (!isBuyNow && (!ordererName || !ordererPhone)) {
      return jsonError(400, 'INVALID_INPUT', 'ordererName and ordererPhone are required.');
    }

    const shopStoreId = await getShopStoreId(prisma);
    const createOrderTransaction = () =>
      prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            userId: buyerUserId,
            buyerType,
            buyerGuestTokenHash,
            productType: data.productType,
            receiveMethod: data.receiveMethod,
            receiverName: isFund ? data.receiverName ?? null : null,
            receiverPhone: isFund ? data.receiverPhone ?? null : null,
            deliveryZipCode: isFundDelivery ? data.deliveryZipCode ?? null : null,
            deliveryAddressMain: isFundDelivery ? data.deliveryAddressMain ?? null : null,
            deliveryAddressDetail: isFundDelivery ? data.deliveryAddressDetail ?? null : null,
            deliveryMessage: isFundDelivery ? data.deliveryMessage ?? null : null,
            ordererName,
            ordererPhone,
            paymentMethod: data.paymentMethod,
            billingKey: isFundCard ? normalizedBillingKey : null,
            // 세부 결제수단은 온라인 fund에서만 받는다. 현장결제·buynow는 모두 null.
            cardCompany: data.paymentMethod === ORDER_PAYMENT_METHOD.ONLINE ? (data.cardCompany ?? null) : null,
            bankCode: data.paymentMethod === ORDER_PAYMENT_METHOD.ONLINE ? (data.bankCode ?? null) : null,
            easyPayProvider: null,
            // 현장결제도 접수 시점엔 대기. 결제완료는 관리자가 별도로 처리한다.
            paymentStatus: ORDER_PAYMENT_STATUS.PENDING,
            paymentAmount,
          },
          select: {
            id: true,
            productType: true,
            receiveMethod: true,
            receiverName: true,
            receiverPhone: true,
            deliveryZipCode: true,
            deliveryAddressMain: true,
            deliveryAddressDetail: true,
            deliveryMessage: true,
            ordererName: true,
            ordererPhone: true,
            paymentMethod: true,
            billingKey: true,
            cardCompany: true,
            bankCode: true,
            easyPayProvider: true,
            paymentStatus: true,
            receiptStatus: true,
            paymentAmount: true,
            createdAt: true,
          },
        });

        const createdItems = await Promise.all(
          itemRows.map((row) =>
            tx.orderItem.create({
              data: {
                orderId: order.id,
                productId: row.productId,
                quantity: row.quantity,
                price: row.price,
                optionData: row.optionData,
              },
              select: {
                productId: true,
                quantity: true,
                price: true,
                optionData: true,
              },
            })
          )
        );

        // 주문번호는 주문 생성과 같은 트랜잭션에서 발급한다 (플레이스홀더 상점의 일별 순번)
        const { orderNo } = await issueOrderNumber(tx, { orderId: order.id, storeId: shopStoreId, type: 'PRE_ORDER' });

        return { order: { ...order, orderNo }, items: createdItems };
      });
    let created: Awaited<ReturnType<typeof createOrderTransaction>> | null = null;
    for (let attempt = 1; attempt <= ORDER_CREATE_MAX_RETRIES; attempt += 1) {
      try {
        created = await createOrderTransaction();
        break;
      } catch (txnError) {
        if (!isRetryableOrderCreateError(txnError)) {
          throw txnError;
        }
        if (attempt >= ORDER_CREATE_MAX_RETRIES) {
          throw new Error('ORDER_CREATE_RETRY_EXCEEDED');
        }
        await sleep(ORDER_CREATE_RETRY_BASE_DELAY_MS * attempt);
      }
    }

    if (!created) {
      throw new Error('ORDER_CREATE_RETRY_EXCEEDED');
    }

    const orderPayload = {
      ...created.order,
      items: created.items,
    };
    return NextResponse.json({
      status: 'success',
      data: {
        order: orderPayload,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      return jsonError(404, 'PRODUCT_NOT_FOUND', 'one or more products were not found.');
    }
    if (error instanceof Error && error.message === 'VARIANT_SOLD_OUT') {
      return jsonError(409, 'INVALID_STATE', 'sold-out variants cannot be ordered.');
    }
    if (error instanceof Error && error.message === 'ORDER_CREATE_RETRY_EXCEEDED') {
      return jsonError(409, 'ORDER_CREATE_RETRY_EXCEEDED', 'please retry order creation.');
    }

    const message = error instanceof Error ? error.message : '';
    if (message.includes('fund order can contain only one distinct productId')) {
      return jsonError(400, 'FUND_SINGLE_PRODUCT_ONLY', 'fund orders can contain only one product.');
    }

    console.error('Shop order create error:', error);
    return jsonError(500, 'SERVER_ERROR', 'server internal error.');
  }
}
